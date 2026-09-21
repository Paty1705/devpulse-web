-- Actualización de la tabla de tareas para el nuevo modal

ALTER TABLE public.tasks ADD COLUMN item_type TEXT CHECK (item_type IN ('Feature', 'Bug', 'Base de Datos', 'Refactor')) DEFAULT 'Feature';
ALTER TABLE public.tasks ADD COLUMN priority TEXT CHECK (priority IN ('Baja', 'Media', 'Alta', 'Crítica')) DEFAULT 'Media';
ALTER TABLE public.tasks ADD COLUMN acceptance_criteria TEXT[] DEFAULT '{}';
