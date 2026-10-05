-- Convierte "Líder del Proyecto" (projects.leader_id) en un rol funcional real:
-- el líder puede gestionar SU proyecto (editar, miembros, tareas, decidir
-- auditorías) igual que un jefe, EXCEPTO:
--   - marcar una tarea como desplegada ('ready' -> 'completed')
--   - borrar el proyecto
--   - reasignar quién es el líder (eso se restringe en la UI, en
--     NewProjectModal.tsx, deshabilitando ese campo para no-jefes)
-- Esas tres siguen siendo exclusivas de jefe. No otorga poder de crear
-- proyectos nuevos ni de gestionar proyectos ajenos.

-- projects: editar (NO borrar) el proyecto que uno lidera.
drop policy if exists "Only jefes can update projects" on projects;
create policy "Only jefes can update projects"
on projects for update
using (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or leader_id = auth.uid()
);
-- La política de DELETE en projects ("Only jefes can delete projects") no se
-- toca: sigue siendo exclusiva de jefe, tal como quedó en la sesión anterior.

-- tasks: crear/editar/borrar tareas del proyecto que uno lidera.
drop policy if exists "Only jefes can create tasks" on tasks;
create policy "Only jefes can create tasks"
on tasks for insert
with check (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or exists (select 1 from projects where projects.id = tasks.project_id and projects.leader_id = auth.uid())
);

drop policy if exists "Task updates" on tasks;
create policy "Task updates"
on tasks for update
using (
  (
    (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
    and not (is_locked and locked_by is distinct from auth.uid())
  )
  or (
    exists (select 1 from projects where projects.id = tasks.project_id and projects.leader_id = auth.uid())
    and not (is_locked and locked_by is distinct from auth.uid())
  )
  or (
    assigned_to = auth.uid()
    and status <> all (array['in_review'::task_status, 'ready'::task_status])
    and (is_locked = false or locked_by = auth.uid())
  )
)
with check (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or (
    exists (select 1 from projects where projects.id = tasks.project_id and projects.leader_id = auth.uid())
    and status <> 'completed'::task_status
  )
  or (assigned_to = auth.uid())
);

drop policy if exists "Only jefes can delete tasks" on tasks;
create policy "Only jefes can delete tasks"
on tasks for delete
using (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or exists (select 1 from projects where projects.id = tasks.project_id and projects.leader_id = auth.uid())
);

-- project_members: gestionar el equipo del proyecto que uno lidera.
drop policy if exists "Jefes pueden agregar miembros" on project_members;
create policy "Jefes pueden agregar miembros"
on project_members for insert
to authenticated
with check (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or exists (select 1 from projects where projects.id = project_members.project_id and projects.leader_id = auth.uid())
);

drop policy if exists "Jefes pueden quitar miembros" on project_members;
create policy "Jefes pueden quitar miembros"
on project_members for delete
to authenticated
using (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or exists (select 1 from projects where projects.id = project_members.project_id and projects.leader_id = auth.uid())
);

drop policy if exists "Jefes pueden ver miembros" on project_members;
create policy "Jefes pueden ver miembros"
on project_members for select
to authenticated
using (
  (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'jefe'))
  or exists (select 1 from projects where projects.id = project_members.project_id and projects.leader_id = auth.uid())
);

-- audits: aprobar/rechazar auditorías de tareas del proyecto que uno lidera.
drop policy if exists "QA and jefe can insert audits" on audits;
create policy "QA and jefe can insert audits"
on audits for insert
to authenticated
with check (
  auth.uid() = auditor_id
  and (
    (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = any (array['qa'::text, 'jefe'::text])))
    or exists (
      select 1 from tasks
      join projects on projects.id = tasks.project_id
      where tasks.id = audits.task_id and projects.leader_id = auth.uid()
    )
  )
);
