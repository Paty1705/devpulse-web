-- Actualización de la tabla tasks para soportar locked_by y RLS
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.profiles(id);

-- Habilitar RLS en tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Permitir a cualquiera ver las tareas (o podríamos limitarlo a project_members)
-- Por ahora, permitiremos que cualquier autenticado las lea para simplificar, 
-- pero el frontend filtrará por proyecto. Si queremos máxima seguridad:
DROP POLICY IF EXISTS "Users can read project tasks" ON public.tasks;
CREATE POLICY "Users can read project tasks" 
ON public.tasks FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = tasks.project_id 
    AND project_members.user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = tasks.project_id
    AND projects.leader_id = auth.uid()
  )
);

-- Permitir a los miembros del proyecto actualizar tareas
DROP POLICY IF EXISTS "Users can update project tasks" ON public.tasks;
CREATE POLICY "Users can update project tasks" 
ON public.tasks FOR UPDATE TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = tasks.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Permitir a los miembros del proyecto y lideres insertar tareas
DROP POLICY IF EXISTS "Users can insert project tasks" ON public.tasks;
CREATE POLICY "Users can insert project tasks" 
ON public.tasks FOR INSERT TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = tasks.project_id 
    AND project_members.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'jefe'
  )
);

-- Activar Realtime para las tareas
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
COMMIT;
