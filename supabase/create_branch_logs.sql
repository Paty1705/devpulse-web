-- REGISTRO DE AUDITORÍA DE RAMAS GIT (control de versiones)
-- Ejecuta este script en el SQL Editor de Supabase
--
-- Cada vez que la app crea una rama en GitHub (al crear una tarea, o desde
-- el botón "Crear rama en GitHub" del detalle de tarea) se guarda acá quién
-- la disparó, para qué tarea/proyecto y a qué hora. Es solo un log de lo
-- que la app hizo en GitHub, no una sincronización con el repo real: si
-- alguien crea una rama a mano desde `git` o la borra en GitHub, esta tabla
-- no se entera.

CREATE TABLE IF NOT EXISTS public.branch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  branch_name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  already_existed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS branch_logs_project_id_idx ON public.branch_logs(project_id);
CREATE INDEX IF NOT EXISTS branch_logs_created_at_idx ON public.branch_logs(created_at DESC);

ALTER TABLE public.branch_logs ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a cualquier autenticado, igual que audits/tasks/projects
-- en el resto de la app: el filtrado por rol (jefe ve todo, líder solo lo
-- de su proyecto) se hace en la UI, no en RLS. Ver nota de "security RLS
-- reads" pendiente en el proyecto.
DROP POLICY IF EXISTS "Authenticated users can view branch logs" ON public.branch_logs;
CREATE POLICY "Authenticated users can view branch logs"
ON public.branch_logs FOR SELECT TO authenticated
USING (true);

-- Solo se puede insertar un registro identificándose a uno mismo como autor.
DROP POLICY IF EXISTS "Users can log their own branch creations" ON public.branch_logs;
CREATE POLICY "Users can log their own branch creations"
ON public.branch_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);
