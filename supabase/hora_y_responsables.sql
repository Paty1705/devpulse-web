-- Hora de entrega en las propuestas y varios responsables: al aceptar, cada
-- responsable recibe su propia tarea, con su avance y su estado.
-- Es idempotente.

BEGIN;

ALTER TABLE public.meeting_task_proposals ADD COLUMN IF NOT EXISTS due_time time;
-- Personas además de assigned_to.
ALTER TABLE public.meeting_task_proposals ADD COLUMN IF NOT EXISTS co_assignees uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tasks.from_meeting IS
  'Trabajo asignado por el jefe (salió de una junta o la creó para otra persona): el jefe la ve aunque no tenga proyecto.';

CREATE OR REPLACE FUNCTION public.accept_meeting_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  p public.meeting_task_proposals%ROWTYPE;
  v_people uuid[];
  v_person uuid;
  v_due timestamptz;
  v_new_id uuid;
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

  -- Sin hora se entiende "al final del día", en hora de México.
  IF p.due_date IS NOT NULL THEN
    v_due := (p.due_date + coalesce(p.due_time, TIME '23:59')) AT TIME ZONE 'America/Mexico_City';
  END IF;

  -- Principal primero, sin repetidos; de las demás solo cuentas aprobadas.
  v_people := ARRAY(
    SELECT u.person
    FROM unnest(ARRAY[p.assigned_to] || p.co_assignees) WITH ORDINALITY AS u(person, n)
    WHERE u.person IS NOT NULL
      AND (u.person = p.assigned_to
        OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = u.person AND pr.status = 'approved'))
    GROUP BY u.person
    ORDER BY min(u.n)
  );
  IF cardinality(v_people) = 0 THEN
    v_people := ARRAY[NULL::uuid];
  END IF;

  FOREACH v_person IN ARRAY v_people LOOP
    INSERT INTO public.tasks (
      project_id, title, description, priority, assigned_to,
      start_date, due_date, status, from_meeting
    ) VALUES (
      p.project_id, p.title, p.description, p.priority, v_person,
      current_date, v_due, 'backlog', true
    )
    RETURNING id INTO v_new_id;

    IF p.test_date IS NOT NULL THEN
      INSERT INTO public.task_test_dates (task_id, test_date)
      VALUES (v_new_id, p.test_date);
    END IF;

    v_task_id := coalesce(v_task_id, v_new_id);
  END LOOP;

  UPDATE public.meeting_task_proposals
  SET status = 'aceptada', task_id = v_task_id
  WHERE id = p_proposal_id;

  RETURN v_task_id;
END;
$function$;

-- Corrige las tareas de juntas que quedaron a las 00:00 UTC (en México, las
-- 18:00 del día anterior): pasan al final del día que se eligió.
UPDATE public.tasks
SET due_date = (((due_date AT TIME ZONE 'UTC')::date + TIME '23:59') AT TIME ZONE 'America/Mexico_City')
WHERE from_meeting
  AND due_date IS NOT NULL
  AND (due_date AT TIME ZONE 'UTC')::time = TIME '00:00';

COMMIT;
