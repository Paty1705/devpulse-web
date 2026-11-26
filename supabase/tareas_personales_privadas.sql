-- Tareas sin proyecto (personales): solo las ve su dueño, ni siquiera el jefe.
-- Excepción: las que el jefe aceptó en una junta son trabajo asignado, y él
-- las sigue viendo aunque después se elimine la junta.
-- Las tareas de proyecto siguen visibles para todas las cuentas aprobadas.
-- Es idempotente.

BEGIN;

-- 1. Marca permanente de las tareas que salieron de una junta ----------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS from_meeting boolean NOT NULL DEFAULT false;

UPDATE public.tasks t SET from_meeting = true
WHERE NOT t.from_meeting
  AND EXISTS (SELECT 1 FROM public.meeting_task_proposals p WHERE p.task_id = t.id);

-- Una vez puesta no se quita: así nadie esconde un trabajo asignado.
CREATE OR REPLACE FUNCTION public.tasks_keep_from_meeting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.from_meeting := OLD.from_meeting OR NEW.from_meeting;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_keep_from_meeting ON public.tasks;
CREATE TRIGGER tasks_keep_from_meeting
BEFORE UPDATE OF from_meeting ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_keep_from_meeting();

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
    start_date, due_date, status, from_meeting
  ) VALUES (
    p.project_id, p.title, p.description, p.priority, p.assigned_to,
    current_date, p.due_date, 'backlog', true
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

-- 2. Quién ve qué -------------------------------------------------------------
-- RESTRICTIVE: se suma como condición obligatoria a las políticas que ya
-- existen (ver, crear, editar y borrar), sin reemplazarlas.
DROP POLICY IF EXISTS "Personal tasks are private" ON public.tasks;
CREATE POLICY "Personal tasks are private"
ON public.tasks AS RESTRICTIVE FOR ALL TO authenticated
USING (
  project_id IS NOT NULL
  OR assigned_to = auth.uid()
  OR (from_meeting AND public.is_jefe())
)
WITH CHECK (
  project_id IS NOT NULL
  OR assigned_to = auth.uid()
  OR (from_meeting AND public.is_jefe())
);

-- Dejaba leer a miembros y líderes aunque la cuenta ya no estuviera aprobada;
-- las cuentas aprobadas ya leen por "Tasks viewable by everyone".
DROP POLICY IF EXISTS "Users can read project tasks" ON public.tasks;

-- Avances, fechas de prueba y revisiones: solo si se puede ver la tarea
-- (la subconsulta aplica las políticas de tasks).
DROP POLICY IF EXISTS "Follows task visibility" ON public.task_progress;
CREATE POLICY "Follows task visibility"
ON public.task_progress AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_progress.task_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_progress.task_id));

DROP POLICY IF EXISTS "Follows task visibility" ON public.task_test_dates;
CREATE POLICY "Follows task visibility"
ON public.task_test_dates AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_test_dates.task_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_test_dates.task_id));

DROP POLICY IF EXISTS "Follows task visibility" ON public.audits;
CREATE POLICY "Follows task visibility"
ON public.audits AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = audits.task_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = audits.task_id));

-- Repetitivas personales: solo su dueño (tampoco el jefe).
DROP POLICY IF EXISTS "Personal recurrences are private" ON public.task_recurrences;
CREATE POLICY "Personal recurrences are private"
ON public.task_recurrences AS RESTRICTIVE FOR ALL TO authenticated
USING (project_id IS NOT NULL OR assigned_to = auth.uid())
WITH CHECK (project_id IS NOT NULL OR assigned_to = auth.uid());

-- 3. Al eliminar una cuenta, lo personal no se hereda ------------------------
CREATE OR REPLACE FUNCTION public.user_pending_work(target uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_jefe() THEN
    RAISE EXCEPTION 'Solo un jefe puede consultar esto.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'projects',    (SELECT count(*) FROM public.projects WHERE leader_id = target),
    'tasks',       (SELECT count(*) FROM public.tasks WHERE assigned_to = target AND (project_id IS NOT NULL OR from_meeting)),
    'recurrences', (SELECT count(*) FROM public.task_recurrences WHERE assigned_to = target AND project_id IS NOT NULL)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user(target uuid, heir uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_jefe() THEN
    RAISE EXCEPTION 'Solo un jefe puede eliminar usuarios.' USING ERRCODE = '42501';
  END IF;
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta.';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese usuario ya no existe.';
  END IF;

  IF heir IS NOT NULL THEN
    IF heir = target OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = heir AND status = 'approved') THEN
      RAISE EXCEPTION 'Elige a otra persona aprobada para recibir su trabajo.';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.projects WHERE leader_id = target)
     OR EXISTS (SELECT 1 FROM public.tasks WHERE assigned_to = target AND (project_id IS NOT NULL OR from_meeting))
     OR EXISTS (SELECT 1 FROM public.task_recurrences WHERE assigned_to = target AND project_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Tiene proyectos o tareas: elige quién los recibe.';
  END IF;

  -- Sus tareas personales se borran con la cuenta: nadie más debe verlas.
  DELETE FROM public.tasks WHERE assigned_to = target AND project_id IS NULL AND NOT from_meeting;
  DELETE FROM public.task_recurrences WHERE assigned_to = target AND project_id IS NULL;

  UPDATE public.projects SET leader_id = heir WHERE leader_id = target;
  UPDATE public.tasks SET assigned_to = heir WHERE assigned_to = target;
  UPDATE public.task_recurrences SET assigned_to = heir WHERE assigned_to = target;

  UPDATE public.tasks SET is_locked = false, locked_by = NULL WHERE locked_by = target;
  UPDATE public.projects SET created_by = NULL WHERE created_by = target;
  UPDATE public.audits SET auditor_id = NULL WHERE auditor_id = target;
  UPDATE public.resources SET recommended_for = NULL WHERE recommended_for = target;

  DELETE FROM auth.users WHERE id = target;
END;
$function$;

COMMIT;
