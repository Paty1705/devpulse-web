-- Faltaban políticas de DELETE en projects y tasks (solo existían SELECT/INSERT/UPDATE),
-- lo que bloqueaba el borrado de proyectos para absolutamente cualquier usuario, incluso
-- un jefe autenticado de verdad (RLS deniega por defecto si no hay política para el comando).
-- Sigue el mismo patrón que las políticas de INSERT/UPDATE ya existentes en estas tablas
-- (solo rol 'jefe'). tasks.project_id y project_members.project_id ya tienen
-- ON DELETE CASCADE hacia projects, así que borrar un proyecto borra sus tareas y
-- miembros automáticamente una vez que esta política lo permite.

create policy "Only jefes can delete projects"
on projects for delete
using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe')
);

create policy "Only jefes can delete tasks"
on tasks for delete
using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe')
);
