-- =====================================================================
-- Eliminar usuarios desde la interfaz (solo jefatura).
--
-- Borrar una cuenta toca auth.users, que la app no puede modificar con la
-- llave pública. Estas funciones lo hacen en la base y validan que quien
-- llama sea un jefe aprobado.
--
-- Los proyectos, tareas y repeticiones de la persona NO se borran: hay que
-- elegir a quién pasan. Sus datos personales (notas, agenda, asistencias,
-- avances, notificaciones y perfil) sí se borran.
--
-- Se puede correr varias veces.
-- =====================================================================

-- Trabajo a cargo de una persona, para avisar antes de eliminarla.
CREATE OR REPLACE FUNCTION public.user_pending_work(target UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_jefe() THEN
    RAISE EXCEPTION 'Solo un jefe puede consultar esto.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'projects',    (SELECT count(*) FROM public.projects WHERE leader_id = target),
    'tasks',       (SELECT count(*) FROM public.tasks WHERE assigned_to = target),
    'recurrences', (SELECT count(*) FROM public.task_recurrences WHERE assigned_to = target)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user(target UUID, heir UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_jefe() THEN
    RAISE EXCEPTION 'Solo un jefe puede eliminar usuarios.' USING ERRCODE = '42501';
  END IF;
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propia cuenta.';
  END IF;
  -- Bloquea la fila para que nadie le asigne trabajo mientras se elimina.
  PERFORM 1 FROM public.profiles WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese usuario ya no existe.';
  END IF;

  IF heir IS NOT NULL THEN
    IF heir = target OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = heir AND status = 'approved') THEN
      RAISE EXCEPTION 'Elige a otra persona aprobada para recibir su trabajo.';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.projects WHERE leader_id = target)
     OR EXISTS (SELECT 1 FROM public.tasks WHERE assigned_to = target)
     OR EXISTS (SELECT 1 FROM public.task_recurrences WHERE assigned_to = target) THEN
    RAISE EXCEPTION 'Tiene proyectos o tareas: elige quién los recibe.';
  END IF;

  UPDATE public.projects SET leader_id = heir WHERE leader_id = target;
  UPDATE public.tasks SET assigned_to = heir WHERE assigned_to = target;
  UPDATE public.task_recurrences SET assigned_to = heir WHERE assigned_to = target;

  -- Referencias que impedirían el borrado, o que se llevarían cosas del equipo.
  UPDATE public.tasks SET is_locked = false, locked_by = NULL WHERE locked_by = target;
  UPDATE public.projects SET created_by = NULL WHERE created_by = target;
  UPDATE public.audits SET auditor_id = NULL WHERE auditor_id = target;
  UPDATE public.resources SET recommended_for = NULL WHERE recommended_for = target;

  -- Borra en cascada la identidad, las sesiones, el perfil y sus datos personales.
  DELETE FROM auth.users WHERE id = target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_pending_work(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.delete_user(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_pending_work(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID, UUID) TO authenticated;
