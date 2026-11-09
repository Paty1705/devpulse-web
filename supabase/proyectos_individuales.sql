-- PROYECTOS INDIVIDUALES
-- Ejecuta este script en el SQL Editor de Supabase (ya aplicado como la
-- migración "proyectos_individuales").
--
-- En el área cada proyecto es de una sola persona: el responsable es
-- projects.leader_id y la app ya no ofrece el modo "En equipo".
-- No se tocan tareas ni project_members: las tareas existentes conservan a
-- quien estaban asignadas, y al editar un proyecto la app quita los
-- colaboradores que hayan quedado de cuando existía el modo equipo.

UPDATE public.projects SET mode = 'individual' WHERE mode IS DISTINCT FROM 'individual';
ALTER TABLE public.projects ALTER COLUMN mode SET DEFAULT 'individual';
