-- REGISTRO CON CORREO Y ROL SOLICITADO
-- Ejecuta este script en el SQL Editor de Supabase
--
-- Permite que quien se registra elija el rol que SOLICITA (developer, qa o
-- pasante). El rol real sigue siendo 'pasante' y la cuenta sigue en
-- 'pending' hasta que un jefe la apruebe; la pantalla de Usuarios muestra el
-- rol solicitado como sugerencia. Nadie puede pedir ser 'jefe' desde fuera.

-- 1. Columna con el rol solicitado (solo informativa, no da permisos)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS requested_role TEXT
  CHECK (requested_role IN ('developer', 'qa', 'pasante'));

-- 2. El trigger de alta lee el rol solicitado del registro (si viene y es válido)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  user_count INT;
  wanted TEXT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;

  wanted := new.raw_user_meta_data->>'requested_role';
  IF wanted IS NULL OR wanted NOT IN ('developer', 'qa', 'pasante') THEN
    wanted := NULL;
  END IF;

  IF user_count = 0 THEN
    INSERT INTO public.profiles (id, email, role, status)
    VALUES (new.id, new.email, 'jefe', 'approved');
  ELSE
    INSERT INTO public.profiles (id, email, role, status, requested_role)
    VALUES (new.id, new.email, 'pasante', 'pending', wanted);
  END IF;

  RETURN new;
END;
$function$;

-- 3. Para quien entra con Google/GitHub (no pasa por el formulario): puede
--    indicar su rol solicitado UNA vez que ya tiene cuenta, solo en su propia
--    fila y solo mientras siga 'pending'. Los usuarios no pueden hacer UPDATE
--    directo sobre profiles (solo jefes), por eso va como función.
CREATE OR REPLACE FUNCTION public.set_requested_role(wanted TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF wanted NOT IN ('developer', 'qa', 'pasante') THEN
    RAISE EXCEPTION 'Rol no permitido';
  END IF;

  UPDATE public.profiles
  SET requested_role = wanted
  WHERE id = auth.uid() AND status = 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_requested_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_requested_role(TEXT) TO authenticated;
