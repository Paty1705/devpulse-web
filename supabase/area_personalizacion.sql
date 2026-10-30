-- PERSONALIZACIÓN PARA EL ÁREA: AVANCES, FECHAS DE PRUEBA, TAREAS
-- RECURRENTES, JUNTAS (MINUTA + GRABACIÓN + PROPUESTAS DE IA) Y RECURSOS
-- Ejecuta este script completo en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué NO cambia:
--   - projects ya tiene mode ('individual' | 'team') y leader_id. Para el
--     área, "un responsable por proyecto" = mode 'individual' + leader_id.
--     No se borra project_members para no romper proyectos 'team' existentes.
--   - tasks.priority y tasks.due_date ya existen (Baja/Media/Alta/Crítica).
--   - profiles.preferences (JSONB) ya existe: ahí se guardan tema, colores
--     de acento, modo vidrio y mascota. No requiere migración.
--
-- Orden:
--   0. Helpers
--   1. Tareas: fecha de inicio, % de avance y fechas de prueba
--   2. Registro de avances (con trigger que actualiza tasks.progress)
--   3. Tareas recurrentes (plantillas + generador + pg_cron)
--   4. Juntas: asistentes, minuta, propuestas de IA y aceptar propuesta
--   5. Tablero de recursos
--   6. Buckets de Storage (grabaciones y archivos de recursos)


-- =====================================================================
-- 0. HELPERS
-- =====================================================================

-- ¿El usuario actual es jefe aprobado? SECURITY DEFINER para no pasar por
-- las políticas de profiles (evita recursión), igual que is_approved().
CREATE OR REPLACE FUNCTION public.is_jefe()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'jefe' AND status = 'approved'
  );
$function$;

-- ¿El usuario actual puede gestionar esta tarea? (jefe, líder del proyecto
-- o la persona asignada).
CREATE OR REPLACE FUNCTION public.can_manage_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.is_jefe() OR EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = p_task_id
      AND (t.assigned_to = auth.uid() OR p.leader_id = auth.uid())
  );
$function$;


-- =====================================================================
-- 1. TAREAS: INICIO, AVANCE Y FECHAS DE PRUEBA
-- =====================================================================

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS progress SMALLINT NOT NULL DEFAULT 0
  CHECK (progress BETWEEN 0 AND 100);
-- Se llena en la sección 3 (FK agregada ahí, cuando la tabla ya existe).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_id UUID;

-- Una tarea puede tener varias fechas de prueba; cada una puede tener su
-- propio responsable (normalmente QA) y su resultado.
CREATE TABLE IF NOT EXISTS public.task_test_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  tester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  result TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (result IN ('pendiente', 'aprobada', 'fallida')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS task_test_dates_task_idx ON public.task_test_dates(task_id);
CREATE INDEX IF NOT EXISTS task_test_dates_date_idx ON public.task_test_dates(test_date);

ALTER TABLE public.task_test_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view test dates" ON public.task_test_dates;
CREATE POLICY "Approved users can view test dates"
ON public.task_test_dates FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Managers can insert test dates" ON public.task_test_dates;
CREATE POLICY "Managers can insert test dates"
ON public.task_test_dates FOR INSERT TO authenticated
WITH CHECK (public.can_manage_task(task_id));

-- El tester asignado también puede actualizar (para marcar el resultado).
DROP POLICY IF EXISTS "Managers and tester can update test dates" ON public.task_test_dates;
CREATE POLICY "Managers and tester can update test dates"
ON public.task_test_dates FOR UPDATE TO authenticated
USING (public.can_manage_task(task_id) OR tester_id = auth.uid());

DROP POLICY IF EXISTS "Managers can delete test dates" ON public.task_test_dates;
CREATE POLICY "Managers can delete test dates"
ON public.task_test_dates FOR DELETE TO authenticated
USING (public.can_manage_task(task_id));


-- =====================================================================
-- 2. REGISTRO DE AVANCES
-- =====================================================================
-- Distinto del status del Kanban: el status dice DÓNDE está la tarea,
-- el avance dice QUÉ se hizo. Es un historial: no se edita, solo se agrega.

CREATE TABLE IF NOT EXISTS public.task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  percent SMALLINT NOT NULL CHECK (percent BETWEEN 0 AND 100),
  note TEXT NOT NULL DEFAULT '',
  evidence_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS task_progress_task_idx ON public.task_progress(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_progress_user_date_idx ON public.task_progress(user_id, created_at DESC);

ALTER TABLE public.task_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view progress" ON public.task_progress;
CREATE POLICY "Approved users can view progress"
ON public.task_progress FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Managers can register progress" ON public.task_progress;
CREATE POLICY "Managers can register progress"
ON public.task_progress FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_manage_task(task_id));

-- Solo se puede borrar un avance propio (por si se registró por error).
DROP POLICY IF EXISTS "Users can delete their own progress" ON public.task_progress;
CREATE POLICY "Users can delete their own progress"
ON public.task_progress FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Mantiene tasks.progress = último avance registrado. SECURITY DEFINER
-- porque las políticas de UPDATE de tasks bloquean a la persona asignada
-- cuando la tarea está en 'in_review' o 'ready'.
CREATE OR REPLACE FUNCTION public.sync_task_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_task_id uuid := COALESCE(NEW.task_id, OLD.task_id);
BEGIN
  UPDATE public.tasks
  SET progress = COALESCE((
    SELECT percent FROM public.task_progress
    WHERE task_id = v_task_id
    ORDER BY created_at DESC
    LIMIT 1
  ), 0)
  WHERE id = v_task_id;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS on_task_progress_change ON public.task_progress;
CREATE TRIGGER on_task_progress_change
AFTER INSERT OR DELETE ON public.task_progress
FOR EACH ROW EXECUTE FUNCTION public.sync_task_progress();


-- =====================================================================
-- 3. TAREAS RECURRENTES
-- =====================================================================
-- Una plantilla genera una tarea nueva cada vez que toca, así cada
-- ocurrencia tiene su propio avance y su propio estado.

CREATE TABLE IF NOT EXISTS public.task_recurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  item_type TEXT NOT NULL DEFAULT 'Feature',
  priority TEXT NOT NULL DEFAULT 'Media'
    CHECK (priority IN ('Baja', 'Media', 'Alta', 'Crítica')),
  frequency TEXT NOT NULL CHECK (frequency IN ('diaria', 'semanal', 'mensual')),
  every_n SMALLINT NOT NULL DEFAULT 1 CHECK (every_n BETWEEN 1 AND 52),
  -- Días que se da para terminar cada ocurrencia (fecha límite = fecha de generación + due_in_days).
  due_in_days SMALLINT NOT NULL DEFAULT 0 CHECK (due_in_days BETWEEN 0 AND 60),
  next_run DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS task_recurrences_next_run_idx
  ON public.task_recurrences(next_run) WHERE active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_recurrence_id_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_recurrence_id_fkey
      FOREIGN KEY (recurrence_id) REFERENCES public.task_recurrences(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.task_recurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view recurrences" ON public.task_recurrences;
CREATE POLICY "Approved users can view recurrences"
ON public.task_recurrences FOR SELECT TO authenticated
USING (public.is_approved());

-- Igual que crear tareas: jefe o líder del proyecto.
DROP POLICY IF EXISTS "Jefes and leaders manage recurrences" ON public.task_recurrences;
CREATE POLICY "Jefes and leaders manage recurrences"
ON public.task_recurrences FOR ALL TO authenticated
USING (
  public.is_jefe()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = task_recurrences.project_id AND p.leader_id = auth.uid())
)
WITH CHECK (
  public.is_jefe()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = task_recurrences.project_id AND p.leader_id = auth.uid())
);

-- Genera las tareas pendientes de todas las plantillas activas. Si el
-- servidor estuvo apagado varios días, se pone al día generando cada
-- ocurrencia que faltó (con tope de 60 por plantilla para no inundar).
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks(p_today date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r public.task_recurrences%ROWTYPE;
  v_run date;
  v_step interval;
  v_count integer := 0;
  v_guard integer;
BEGIN
  FOR r IN
    SELECT * FROM public.task_recurrences
    WHERE active AND next_run <= p_today
    FOR UPDATE SKIP LOCKED
  LOOP
    v_step := CASE r.frequency
      WHEN 'diaria'  THEN make_interval(days   => r.every_n)
      WHEN 'semanal' THEN make_interval(weeks  => r.every_n)
      ELSE                make_interval(months => r.every_n)
    END;
    v_run := r.next_run;
    v_guard := 0;

    WHILE v_run <= p_today
      AND (r.end_date IS NULL OR v_run <= r.end_date)
      AND v_guard < 60
    LOOP
      INSERT INTO public.tasks (
        project_id, title, description, item_type, priority,
        assigned_to, start_date, due_date, status, recurrence_id
      ) VALUES (
        r.project_id, r.title, r.description, r.item_type, r.priority,
        r.assigned_to, v_run, (v_run + r.due_in_days), 'backlog', r.id
      );
      v_count := v_count + 1;
      v_guard := v_guard + 1;
      v_run := (v_run + v_step)::date;
    END LOOP;

    UPDATE public.task_recurrences
    SET next_run = v_run,
        active = (r.end_date IS NULL OR v_run <= r.end_date)
    WHERE id = r.id;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Solo el servidor (pg_cron / service role) debe poder correr el generador.
REVOKE ALL ON FUNCTION public.generate_recurring_tasks(date) FROM PUBLIC, anon, authenticated;

-- Programación diaria a las 06:05 hora de Ciudad de México (12:05 UTC).
-- Requiere la extensión pg_cron: Dashboard → Database → Extensions → pg_cron.
-- Si no está habilitada, este bloque solo avisa y no falla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generar-tareas-recurrentes';
    PERFORM cron.schedule(
      'generar-tareas-recurrentes',
      '5 12 * * *',
      'SELECT public.generate_recurring_tasks();'
    );
  ELSE
    RAISE NOTICE 'pg_cron no está habilitado: habilítalo y vuelve a correr este bloque para generar tareas recurrentes cada día.';
  END IF;
END $$;


-- =====================================================================
-- 4. JUNTAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'programada'
    CHECK (status IN ('programada', 'en_curso', 'terminada', 'cancelada')),
  -- Desde cuándo se revisan avances (normalmente la junta anterior).
  review_from DATE,
  notes TEXT NOT NULL DEFAULT '',
  -- Ruta dentro del bucket 'meeting-recordings' (ver sección 6).
  recording_path TEXT,
  transcript TEXT,
  ai_status TEXT NOT NULL DEFAULT 'sin_grabacion'
    CHECK (ai_status IN ('sin_grabacion', 'procesando', 'listo', 'error')),
  ai_error TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS meetings_scheduled_idx ON public.meetings(scheduled_at DESC);

CREATE TABLE IF NOT EXISTS public.meeting_attendees (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attended BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (meeting_id, user_id)
);

-- Minuta estructurada: temas, acuerdos y pendientes, en orden.
CREATE TABLE IF NOT EXISTS public.meeting_minute_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tema', 'acuerdo', 'pendiente')),
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS meeting_minute_items_meeting_idx
  ON public.meeting_minute_items(meeting_id, kind, position);

-- Borradores de tareas que la IA saca de la transcripción (o que se
-- agregan a mano durante la junta). Nada se asigna hasta que el jefe acepta.
CREATE TABLE IF NOT EXISTS public.meeting_task_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Media'
    CHECK (priority IN ('Baja', 'Media', 'Alta', 'Crítica')),
  due_date DATE,
  test_date DATE,
  -- Frase de la transcripción de donde salió la propuesta.
  source_quote TEXT,
  source TEXT NOT NULL DEFAULT 'ia' CHECK (source IN ('ia', 'manual')),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aceptada', 'descartada')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS meeting_task_proposals_meeting_idx
  ON public.meeting_task_proposals(meeting_id, status);

-- ¿El usuario actual es asistente de la junta?
CREATE OR REPLACE FUNCTION public.is_meeting_attendee(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_attendees
    WHERE meeting_id = p_meeting_id AND user_id = auth.uid()
  );
$function$;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minute_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_task_proposals ENABLE ROW LEVEL SECURITY;

-- meetings: la ven el jefe y los asistentes; solo el jefe la crea y edita.
DROP POLICY IF EXISTS "Jefes and attendees can view meetings" ON public.meetings;
CREATE POLICY "Jefes and attendees can view meetings"
ON public.meetings FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_jefe() OR public.is_meeting_attendee(id)));

DROP POLICY IF EXISTS "Jefes manage meetings" ON public.meetings;
CREATE POLICY "Jefes manage meetings"
ON public.meetings FOR ALL TO authenticated
USING (public.is_jefe())
WITH CHECK (public.is_jefe());

-- meeting_attendees
DROP POLICY IF EXISTS "Jefes and attendees can view attendees" ON public.meeting_attendees;
CREATE POLICY "Jefes and attendees can view attendees"
ON public.meeting_attendees FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id)));

DROP POLICY IF EXISTS "Jefes manage attendees" ON public.meeting_attendees;
CREATE POLICY "Jefes manage attendees"
ON public.meeting_attendees FOR ALL TO authenticated
USING (public.is_jefe())
WITH CHECK (public.is_jefe());

-- meeting_minute_items: la minuta la puede llenar cualquier asistente.
DROP POLICY IF EXISTS "Jefes and attendees can view minutes" ON public.meeting_minute_items;
CREATE POLICY "Jefes and attendees can view minutes"
ON public.meeting_minute_items FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id)));

DROP POLICY IF EXISTS "Jefes and attendees can write minutes" ON public.meeting_minute_items;
CREATE POLICY "Jefes and attendees can write minutes"
ON public.meeting_minute_items FOR INSERT TO authenticated
WITH CHECK (public.is_approved() AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id)));

DROP POLICY IF EXISTS "Authors and jefes can edit minutes" ON public.meeting_minute_items;
CREATE POLICY "Authors and jefes can edit minutes"
ON public.meeting_minute_items FOR UPDATE TO authenticated
USING (public.is_jefe() OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authors and jefes can delete minutes" ON public.meeting_minute_items;
CREATE POLICY "Authors and jefes can delete minutes"
ON public.meeting_minute_items FOR DELETE TO authenticated
USING (public.is_jefe() OR created_by = auth.uid());

-- meeting_task_proposals: las ven los asistentes; solo el jefe decide.
-- (La IA las inserta desde el servidor con la service role, que salta RLS.)
DROP POLICY IF EXISTS "Jefes and attendees can view proposals" ON public.meeting_task_proposals;
CREATE POLICY "Jefes and attendees can view proposals"
ON public.meeting_task_proposals FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id)));

DROP POLICY IF EXISTS "Jefes manage proposals" ON public.meeting_task_proposals;
CREATE POLICY "Jefes manage proposals"
ON public.meeting_task_proposals FOR ALL TO authenticated
USING (public.is_jefe())
WITH CHECK (public.is_jefe());

-- Acepta una propuesta: crea la tarea real (y su fecha de prueba, si trae)
-- y deja la propuesta ligada a ella, todo en una sola transacción.
CREATE OR REPLACE FUNCTION public.accept_meeting_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  p public.meeting_task_proposals%ROWTYPE;
  v_task_id uuid;
BEGIN
  IF NOT public.is_jefe() THEN
    RAISE EXCEPTION 'Solo un jefe puede aceptar propuestas' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM public.meeting_task_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La propuesta no existe';
  END IF;
  IF p.status = 'aceptada' THEN
    RETURN p.task_id;
  END IF;

  INSERT INTO public.tasks (
    project_id, title, description, priority, assigned_to,
    start_date, due_date, status
  ) VALUES (
    p.project_id, p.title, p.description, p.priority, p.assigned_to,
    current_date, p.due_date, 'backlog'
  )
  RETURNING id INTO v_task_id;

  IF p.test_date IS NOT NULL THEN
    INSERT INTO public.task_test_dates (task_id, test_date)
    VALUES (v_task_id, p.test_date);
  END IF;

  UPDATE public.meeting_task_proposals
  SET status = 'aceptada', task_id = v_task_id
  WHERE id = p_proposal_id;

  RETURN v_task_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_meeting_proposal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_meeting_proposal(uuid) TO authenticated;


-- =====================================================================
-- 5. TABLERO DE RECURSOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'documento', 'enlace')),
  -- Uno de los dos: un link externo (YouTube, docs) o un archivo subido
  -- al bucket 'resources' (ver sección 6).
  url TEXT,
  storage_path TEXT,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  duration_minutes SMALLINT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  -- NULL = recomendado para todo el equipo.
  recommended_for UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recommended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT resources_has_target CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS resources_created_idx ON public.resources(created_at DESC);
CREATE INDEX IF NOT EXISTS resources_tags_idx ON public.resources USING gin(tags);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view resources" ON public.resources;
CREATE POLICY "Approved users can view resources"
ON public.resources FOR SELECT TO authenticated
USING (
  public.is_approved()
  AND (recommended_for IS NULL OR recommended_for = auth.uid()
       OR recommended_by = auth.uid() OR public.is_jefe())
);

-- Cualquier integrante aprobado puede recomendar algo.
DROP POLICY IF EXISTS "Approved users can add resources" ON public.resources;
CREATE POLICY "Approved users can add resources"
ON public.resources FOR INSERT TO authenticated
WITH CHECK (public.is_approved() AND recommended_by = auth.uid());

DROP POLICY IF EXISTS "Authors and jefes can edit resources" ON public.resources;
CREATE POLICY "Authors and jefes can edit resources"
ON public.resources FOR UPDATE TO authenticated
USING (recommended_by = auth.uid() OR public.is_jefe());

DROP POLICY IF EXISTS "Authors and jefes can delete resources" ON public.resources;
CREATE POLICY "Authors and jefes can delete resources"
ON public.resources FOR DELETE TO authenticated
USING (recommended_by = auth.uid() OR public.is_jefe());


-- =====================================================================
-- 6. STORAGE: GRABACIONES Y ARCHIVOS DE RECURSOS
-- =====================================================================
-- Ambos buckets son privados: se leen con URLs firmadas.
-- Convención de rutas:
--   meeting-recordings/<meeting_id>/<archivo>.webm
--   resources/<user_id>/<archivo>

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('meeting-recordings', 'meeting-recordings', false, 524288000),  -- 500 MB
  ('resources', 'resources', false, 52428800)                     -- 50 MB
ON CONFLICT (id) DO NOTHING;

-- Grabaciones: solo el jefe sube; jefe y asistentes escuchan.
DROP POLICY IF EXISTS "Jefes upload recordings" ON storage.objects;
CREATE POLICY "Jefes upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meeting-recordings' AND public.is_jefe());

DROP POLICY IF EXISTS "Jefes and attendees read recordings" ON storage.objects;
CREATE POLICY "Jefes and attendees read recordings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'meeting-recordings'
  AND (
    public.is_jefe()
    OR public.is_meeting_attendee(((storage.foldername(name))[1])::uuid)
  )
);

DROP POLICY IF EXISTS "Jefes delete recordings" ON storage.objects;
CREATE POLICY "Jefes delete recordings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'meeting-recordings' AND public.is_jefe());

-- Recursos: cada quien sube a su carpeta; todos los aprobados leen.
DROP POLICY IF EXISTS "Users upload own resources" ON storage.objects;
CREATE POLICY "Users upload own resources"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resources'
  AND public.is_approved()
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Approved users read resources" ON storage.objects;
CREATE POLICY "Approved users read resources"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resources' AND public.is_approved());

DROP POLICY IF EXISTS "Owners and jefes delete resources" ON storage.objects;
CREATE POLICY "Owners and jefes delete resources"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'resources'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_jefe())
);
