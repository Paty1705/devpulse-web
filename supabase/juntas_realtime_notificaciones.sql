-- JUNTAS: TIEMPO REAL Y NOTIFICACIONES
-- Ejecuta este script en el SQL Editor de Supabase (ya aplicado como la
-- migración "juntas_realtime_notificaciones"). Es idempotente.

-- 1. Tiempo real para la sala de la junta: los asistentes ven en vivo la
--    minuta, las propuestas de la IA y el estado de la junta.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meetings', 'meeting_minute_items', 'meeting_task_proposals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2. Aviso al ser invitado a una junta.
CREATE OR REPLACE FUNCTION public.notify_meeting_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  m public.meetings%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.meetings WHERE id = NEW.meeting_id;
  -- Quien crea la junta no necesita aviso de su propia invitación.
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      NEW.user_id,
      'meeting_invite',
      'Junta: ' || m.title,
      'Te invitaron a la junta del ' ||
        to_char(m.scheduled_at AT TIME ZONE 'America/Mexico_City', 'DD/MM/YYYY "a las" HH24:MI') || '.',
      '/dashboard/juntas/' || m.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_meeting_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_meeting_attendee_added ON public.meeting_attendees;
CREATE TRIGGER on_meeting_attendee_added
AFTER INSERT ON public.meeting_attendees
FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_invite();

-- 3. "Nueva tarea" avisaba a los miembros del proyecto (project_members).
--    Con proyectos individuales se avisa a la persona asignada.
CREATE OR REPLACE FUNCTION public.notify_new_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  project_name TEXT;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT name INTO project_name FROM public.projects WHERE id = NEW.project_id;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.assigned_to,
    'new_task',
    'Nueva Tarea: ' || NEW.title,
    'Se te asignó una tarea' || COALESCE(' en ' || project_name, '') || '.',
    '/dashboard/kanban'
  );
  RETURN NEW;
END;
$function$;
