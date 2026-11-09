-- =====================================================================
-- Reportes de avance: fecha en que se completó cada tarea.
--
-- tasks no guardaba cuándo pasó a "completed", así que no se podía
-- saber qué se terminó en una semana o mes. completed_at se llena sola
-- al completar y se limpia si la tarea regresa a otra columna.
--
-- Se puede correr varias veces.
-- =====================================================================

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS tasks_completed_at_idx ON public.tasks(completed_at);

CREATE OR REPLACE FUNCTION public.tasks_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := coalesce(NEW.completed_at, now());
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
BEFORE INSERT OR UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_set_completed_at();

-- Las que ya estaban completadas: se toma su último avance registrado
-- (o la fecha de creación si no tienen ninguno). Es aproximado.
UPDATE public.tasks t
SET completed_at = coalesce(
  (SELECT max(p.created_at) FROM public.task_progress p WHERE p.task_id = t.id),
  t.created_at
)
WHERE t.status = 'completed' AND t.completed_at IS NULL;
