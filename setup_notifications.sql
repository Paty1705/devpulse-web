-- TABLA DE NOTIFICACIONES Y TRIGGERS AUTOMÁTICOS
-- Ejecuta este script en el SQL Editor de Supabase

-- 1. Crear la tabla de notificaciones
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Políticas de Seguridad (RLS) para notificaciones
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
ON public.notifications FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" 
ON public.notifications FOR UPDATE TO authenticated 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" 
ON public.notifications FOR INSERT TO authenticated 
WITH CHECK (true);

-- 3. Trigger 1: Notificar al agregar a un miembro a un proyecto
CREATE OR REPLACE FUNCTION notify_project_member() RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
BEGIN
  -- Obtenemos el nombre del proyecto
  SELECT name INTO project_name FROM public.projects WHERE id = NEW.project_id;
  
  -- Insertamos la notificación
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

DROP TRIGGER IF EXISTS on_project_member_added ON public.project_members;
CREATE TRIGGER on_project_member_added
AFTER INSERT ON public.project_members
FOR EACH ROW EXECUTE FUNCTION notify_project_member();


-- 4. Trigger 2: Notificar al equipo cuando se crea una nueva tarea
CREATE OR REPLACE FUNCTION notify_new_task() RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
  member RECORD;
BEGIN
  SELECT name INTO project_name FROM public.projects WHERE id = NEW.project_id;
  
  -- Crear notificación para CADA miembro de ese proyecto
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

DROP TRIGGER IF EXISTS on_task_created ON public.tasks;
CREATE TRIGGER on_task_created
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION notify_new_task();
