-- TAREAS PERSONALES Y PROPUESTAS DE LOS ASISTENTES
-- Ejecuta este script en el SQL Editor de Supabase (ya aplicado como la
-- migración "tareas_personales_y_propuestas"). Es idempotente.

-- =====================================================================
-- 1. TAREAS PERSONALES
-- =====================================================================
-- Una tarea sin proyecto (project_id NULL) asignada a uno mismo es una
-- tarea personal: cualquiera aprobado puede crearla, la maneja de punta a
-- punta sin pasar por auditoría y el jefe la puede ver.

DROP POLICY IF EXISTS "Only jefes can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Create tasks" ON public.tasks;
CREATE POLICY "Create tasks"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'jefe')
  OR EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.leader_id = auth.uid())
  OR (tasks.project_id IS NULL AND tasks.assigned_to = auth.uid() AND public.is_approved())
);

-- Igual que antes, más: el dueño de una tarea personal la mueve en
-- cualquier estado (no hay líder ni auditoría que esperar).
DROP POLICY IF EXISTS "Task updates" ON public.tasks;
CREATE POLICY "Task updates"
ON public.tasks FOR UPDATE TO authenticated
USING (
  (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'jefe')
    AND NOT (is_locked AND locked_by IS DISTINCT FROM auth.uid())
  )
  OR (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.leader_id = auth.uid())
    AND NOT (is_locked AND locked_by IS DISTINCT FROM auth.uid())
  )
  OR (
    assigned_to = auth.uid()
    AND status <> ALL (ARRAY['in_review'::task_status, 'ready'::task_status])
    AND (is_locked = false OR locked_by = auth.uid())
  )
  OR (project_id IS NULL AND assigned_to = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'jefe')
  OR (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.leader_id = auth.uid())
    AND status <> 'completed'::task_status
  )
  OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "Only jefes can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Delete tasks" ON public.tasks;
CREATE POLICY "Delete tasks"
ON public.tasks FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'jefe')
  OR EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.leader_id = auth.uid())
  OR (tasks.project_id IS NULL AND tasks.assigned_to = auth.uid())
);

-- =====================================================================
-- 2. LOS ASISTENTES PROPONEN SUS PROPIAS TAREAS EN LA JUNTA
-- =====================================================================
-- Cada asistente puede proponer tareas para sí mismo (personales o de un
-- proyecto del que es responsable). Solo el jefe las acepta; mientras
-- estén pendientes, su autor las puede editar o quitar.

ALTER TABLE public.meeting_task_proposals
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();

-- ¿El proyecto es nulo (personal) o lo lidera el usuario actual?
CREATE OR REPLACE FUNCTION public.is_own_or_personal_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p_project_id IS NULL OR EXISTS (
    SELECT 1 FROM public.projects WHERE id = p_project_id AND leader_id = auth.uid()
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_own_or_personal_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_or_personal_project(uuid) TO authenticated;

DROP POLICY IF EXISTS "Attendees propose their own tasks" ON public.meeting_task_proposals;
CREATE POLICY "Attendees propose their own tasks"
ON public.meeting_task_proposals FOR INSERT TO authenticated
WITH CHECK (
  public.is_approved()
  AND public.is_meeting_attendee(meeting_id)
  AND created_by = auth.uid()
  AND assigned_to = auth.uid()
  AND source = 'manual'
  AND status = 'pendiente'
  AND task_id IS NULL
  AND public.is_own_or_personal_project(project_id)
);

DROP POLICY IF EXISTS "Authors edit their pending proposals" ON public.meeting_task_proposals;
CREATE POLICY "Authors edit their pending proposals"
ON public.meeting_task_proposals FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND status = 'pendiente')
WITH CHECK (
  created_by = auth.uid()
  AND assigned_to = auth.uid()
  AND status = 'pendiente'
  AND task_id IS NULL
  AND public.is_own_or_personal_project(project_id)
);

DROP POLICY IF EXISTS "Authors delete their pending proposals" ON public.meeting_task_proposals;
CREATE POLICY "Authors delete their pending proposals"
ON public.meeting_task_proposals FOR DELETE TO authenticated
USING (created_by = auth.uid() AND status = 'pendiente');
