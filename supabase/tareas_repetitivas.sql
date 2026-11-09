-- =====================================================================
-- Tareas repetitivas: ajustes sobre task_recurrences y su generador
-- (creados en area_personalizacion.sql, sección 3).
--
-- 1. Columnas nuevas: starts_on (fecha ancla para calcular las
--    repeticiones sin que se recorran) y acceptance_criteria.
-- 2. Cualquier integrante puede repetir sus tareas personales.
-- 3. next_occurrence(): siguiente fecha a partir del ancla, para que
--    "cada mes el día 31" no termine siendo "cada mes el día 28".
-- 4. El generador usa la fecha de la Ciudad de México, pone la fecha
--    límite a las 23:59 locales (igual que la app) y copia criterios.
-- 5. Al crear una repetición se genera de inmediato la primera tarea
--    si ya le toca; al reanudarla no se crean de golpe las que se
--    perdieron mientras estuvo en pausa.
-- 6. pg_cron corre el generador todos los días a las 00:05 (CDMX).
--
-- Se puede correr varias veces.
-- =====================================================================

-- 1. Columnas ------------------------------------------------------------
ALTER TABLE public.task_recurrences ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE public.task_recurrences ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT[] NOT NULL DEFAULT '{}';
UPDATE public.task_recurrences SET starts_on = next_run WHERE starts_on IS NULL;

CREATE INDEX IF NOT EXISTS tasks_recurrence_idx ON public.tasks(recurrence_id);

-- 2. Permisos: jefe, líder del proyecto o dueño de la tarea personal ------
DROP POLICY IF EXISTS "Jefes and leaders manage recurrences" ON public.task_recurrences;
DROP POLICY IF EXISTS "Manage recurrences" ON public.task_recurrences;
CREATE POLICY "Manage recurrences"
ON public.task_recurrences FOR ALL TO authenticated
USING (
  public.is_jefe()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = task_recurrences.project_id AND p.leader_id = auth.uid())
  OR (project_id IS NULL AND assigned_to = auth.uid() AND public.is_approved())
)
WITH CHECK (
  public.is_jefe()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = task_recurrences.project_id AND p.leader_id = auth.uid())
  OR (project_id IS NULL AND assigned_to = auth.uid() AND public.is_approved())
);

-- 3. Siguiente fecha >= p_after a partir del ancla -------------------------
CREATE OR REPLACE FUNCTION public.next_occurrence(
  p_starts_on DATE, p_frequency TEXT, p_every_n INTEGER, p_after DATE
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d INTEGER;
  k INTEGER;
  v DATE;
BEGIN
  IF p_after <= p_starts_on THEN
    RETURN p_starts_on;
  END IF;
  IF p_frequency IN ('diaria', 'semanal') THEN
    d := p_every_n * CASE WHEN p_frequency = 'semanal' THEN 7 ELSE 1 END;
    k := ceil((p_after - p_starts_on)::numeric / d);
    RETURN p_starts_on + k * d;
  END IF;
  -- Mensual: se suma al ancla (no a la fecha anterior) para no recorrerse.
  k := greatest(0, ((extract(year FROM age(p_after, p_starts_on)) * 12
                   + extract(month FROM age(p_after, p_starts_on)))::INTEGER / p_every_n) - 1);
  LOOP
    v := (p_starts_on + make_interval(months => k * p_every_n))::DATE;
    EXIT WHEN v >= p_after;
    k := k + 1;
  END LOOP;
  RETURN v;
END;
$$;

-- 4. Generador ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks(
  p_today DATE DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::DATE,
  p_only UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.task_recurrences%ROWTYPE;
  v_run DATE;
  v_count INTEGER := 0;
  v_guard INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM public.task_recurrences
    WHERE active AND next_run <= p_today AND (p_only IS NULL OR id = p_only)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_run := r.next_run;
    v_guard := 0;
    WHILE v_run <= p_today
      AND (r.end_date IS NULL OR v_run <= r.end_date)
      AND v_guard < 60
    LOOP
      INSERT INTO public.tasks (
        project_id, title, description, item_type, priority, acceptance_criteria,
        assigned_to, start_date, due_date, status, recurrence_id
      ) VALUES (
        r.project_id, r.title, r.description, r.item_type, r.priority, r.acceptance_criteria,
        r.assigned_to, v_run,
        ((v_run + r.due_in_days) + TIME '23:59') AT TIME ZONE 'America/Mexico_City',
        'backlog', r.id
      );
      v_count := v_count + 1;
      v_guard := v_guard + 1;
      v_run := public.next_occurrence(coalesce(r.starts_on, r.next_run), r.frequency, r.every_n, v_run + 1);
    END LOOP;

    UPDATE public.task_recurrences
    SET next_run = v_run,
        active = (end_date IS NULL OR v_run <= end_date)
    WHERE id = r.id;
  END LOOP;
  RETURN v_count;
END;
$$;

-- La versión anterior tenía otra firma; se quita para no dejar dos.
DROP FUNCTION IF EXISTS public.generate_recurring_tasks(DATE);

REVOKE EXECUTE ON FUNCTION public.generate_recurring_tasks(DATE, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_recurring_tasks(DATE, UUID) TO authenticated;

-- 5. Triggers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_recurrences_before()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'America/Mexico_City')::DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.starts_on := coalesce(NEW.starts_on, NEW.next_run, today);
    NEW.next_run := coalesce(NEW.next_run, NEW.starts_on);
  ELSIF NEW.active AND NOT OLD.active AND NEW.next_run < today THEN
    -- Reanudada: salta las fechas que pasaron durante la pausa.
    NEW.next_run := public.next_occurrence(NEW.starts_on, NEW.frequency, NEW.every_n, today);
  END IF;
  -- Si cambió la frecuencia o el ancla, se recalcula la siguiente fecha.
  IF TG_OP = 'UPDATE' AND (NEW.frequency, NEW.every_n, NEW.starts_on) IS DISTINCT FROM (OLD.frequency, OLD.every_n, OLD.starts_on) THEN
    NEW.next_run := public.next_occurrence(NEW.starts_on, NEW.frequency, NEW.every_n, greatest(today, NEW.starts_on));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_recurrences_before ON public.task_recurrences;
CREATE TRIGGER task_recurrences_before
BEFORE INSERT OR UPDATE ON public.task_recurrences
FOR EACH ROW EXECUTE FUNCTION public.task_recurrences_before();

CREATE OR REPLACE FUNCTION public.task_recurrences_generate_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active AND NEW.next_run <= (now() AT TIME ZONE 'America/Mexico_City')::DATE THEN
    PERFORM public.generate_recurring_tasks(p_only => NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS task_recurrences_generate_now ON public.task_recurrences;
CREATE TRIGGER task_recurrences_generate_now
AFTER INSERT OR UPDATE OF active ON public.task_recurrences
FOR EACH ROW EXECUTE FUNCTION public.task_recurrences_generate_now();

REVOKE EXECUTE ON FUNCTION public.task_recurrences_generate_now() FROM anon, public;

-- Realtime para que el tablero vea los cambios de pausa/reanudar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'task_recurrences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_recurrences;
  END IF;
END $$;

-- 6. pg_cron -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generar-tareas-repetitivas';
  -- 06:05 UTC = 00:05 en la Ciudad de México (sin horario de verano).
  PERFORM cron.schedule('generar-tareas-repetitivas', '5 6 * * *', 'SELECT public.generate_recurring_tasks()');
END $$;
