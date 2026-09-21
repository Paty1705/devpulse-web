-- 1. ACTIVAR REALTIME (Para que el punto rojo aparezca en vivo)
-- Supabase requiere que activemos explícitamente qué tablas envían eventos web.
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 2. MEJORAR PERMISOS DE LOS TRIGGERS (Security Definer)
-- Esto asegura que los triggers tengan permiso de leer/escribir sin importar quién los active.

CREATE OR REPLACE FUNCTION notify_project_member() RETURNS TRIGGER 
SECURITY DEFINER -- ¡Clave para que no falle por RLS!
AS $$
DECLARE
  project_name TEXT;
BEGIN
  SELECT name INTO project_name FROM public.projects WHERE id = NEW.project_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.user_id, 
    'project_invite', 
    'Nuevo Proyecto Asignado', 
    'Has sido añadido al equipo del proyecto: ' || project_name, 
    '/dashboard'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_new_task() RETURNS TRIGGER 
SECURITY DEFINER -- ¡Clave para que no falle por RLS!
AS $$
DECLARE
  project_name TEXT;
  member RECORD;
BEGIN
  SELECT name INTO project_name FROM public.projects WHERE id = NEW.project_id;
  
  FOR member IN SELECT user_id FROM public.project_members WHERE project_id = NEW.project_id LOOP
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      member.user_id, 
      'new_task', 
      'Nueva Tarea: ' || NEW.title, 
      'Se ha agregado una nueva tarea al proyecto ' || project_name || '.', 
      '/dashboard/kanban'
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
