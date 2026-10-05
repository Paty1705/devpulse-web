-- TRIGGER QUE APLICA EL RESULTADO DE UNA AUDITORÍA A LA TAREA
-- Ejecuta este script en el SQL Editor de Supabase (después de create_audits.sql)
--
-- Al aprobar: la tarea pasa a "ready" (lista para desplegar) y se libera el
-- bloqueo exclusivo, para que solo el jefe decida el despliegue final.
-- Al rechazar: la tarea vuelve a "in_progress" y queda bloqueada otra vez
-- para la persona asignada, que es quien debe corregirla.
-- Un registro de auditoría en estado "pending" (revisión de QA sin decisión
-- del jefe) no mueve la tarea: solo deja comentarios en el historial.

CREATE OR REPLACE FUNCTION apply_audit_result() RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE public.tasks
    SET status = 'ready', is_locked = false, locked_by = NULL
    WHERE id = NEW.task_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.tasks
    SET status = 'in_progress', is_locked = true, locked_by = assigned_to
    WHERE id = NEW.task_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_audit_result ON public.audits;
CREATE TRIGGER on_audit_result
AFTER INSERT ON public.audits
FOR EACH ROW EXECUTE FUNCTION apply_audit_result();
