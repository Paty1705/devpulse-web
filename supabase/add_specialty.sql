-- ESPECIALIDAD DEL USUARIO (frontend, backend, etc.)
-- Ejecuta este script en el SQL Editor de Supabase (después de add_requested_role.sql)
--
-- Es informativa: se muestra junto al rol en listas, proyectos y tareas.
-- Se elige al registrarse con correo, o desde la pantalla de "cuenta
-- pendiente" para quien entra con Google/GitHub. Un jefe puede cambiarla
-- desde la pantalla de Usuarios.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS specialty TEXT
  CHECK (specialty IN ('frontend', 'backend', 'fullstack', 'bases_de_datos', 'devops', 'movil'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  user_count INT;
  wanted TEXT;
  spec TEXT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;

  wanted := new.raw_user_meta_data->>'requested_role';
  IF wanted IS NULL OR wanted NOT IN ('developer', 'qa', 'pasante') THEN
    wanted := NULL;
  END IF;

  spec := new.raw_user_meta_data->>'specialty';
  IF spec IS NULL OR spec NOT IN ('frontend', 'backend', 'fullstack', 'bases_de_datos', 'devops', 'movil') THEN
    spec := NULL;
  END IF;

  IF user_count = 0 THEN
    INSERT INTO public.profiles (id, email, role, status)
    VALUES (new.id, new.email, 'jefe', 'approved');
  ELSE
    INSERT INTO public.profiles (id, email, role, status, requested_role, specialty)
    VALUES (new.id, new.email, 'pasante', 'pending', wanted, spec);
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_specialty(wanted TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF wanted NOT IN ('frontend', 'backend', 'fullstack', 'bases_de_datos', 'devops', 'movil') THEN
    RAISE EXCEPTION 'Especialidad no permitida';
  END IF;

  UPDATE public.profiles
  SET specialty = wanted
  WHERE id = auth.uid() AND status = 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_specialty(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_specialty(TEXT) TO authenticated;

-- Usuarios semilla / ya existentes (ajusta los correos a tu equipo)
UPDATE public.profiles SET specialty = 'frontend' WHERE email IN ('joana@devpulse.com', 'front.senior@devpulse.com');
UPDATE public.profiles SET specialty = 'backend'  WHERE email IN ('alan@devpulse.com', 'back.senior@devpulse.com');
