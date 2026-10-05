-- APROBACIÓN MANUAL DE CUENTAS NUEVAS
-- Ejecuta este script en el SQL Editor de Supabase
--
-- Hasta ahora, cualquier persona que se loguee con Google/GitHub por
-- primera vez entraba automáticamente con rol 'pasante' (vía el trigger
-- existente `handle_new_user`), sin que nadie lo apruebe, y con el diseño
-- actual de visibilidad (proyectos/tareas abiertos a cualquier usuario
-- autenticado) eso significaba que un desconocido podía ver datos reales
-- apenas logueándose. Esto agrega un estado 'pending' que bloquea toda
-- lectura de datos de la app hasta que un jefe apruebe la cuenta a mano.

-- 1. Columna de estado. El DEFAULT 'approved' hace que todos los perfiles
--    YA EXISTENTES (vos + los usuarios semilla) queden aprobados solos al
--    correr este script — no hace falta aprobarlos a mano.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 2. El trigger de alta ahora también decide el estado: el primer usuario
--    del sistema (bootstrap, ya consumido) sigue entrando como jefe
--    aprobado; cualquiera después de ese entra en 'pending'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;

  IF user_count = 0 THEN
    INSERT INTO public.profiles (id, email, role, status)
    VALUES (new.id, new.email, 'jefe', 'approved');
  ELSE
    INSERT INTO public.profiles (id, email, role, status)
    VALUES (new.id, new.email, 'pasante', 'pending');
  END IF;

  RETURN new;
END;
$function$;

-- 3. Helper para las políticas: ¿el usuario que hace el pedido está
--    aprobado? SECURITY DEFINER para que pueda leer `profiles` sin pasar
--    de nuevo por las políticas de `profiles` (evita recursión).
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$function$;

-- 4. profiles: cualquiera ve su propia fila siempre (para poder mostrarle
--    la pantalla de "pendiente de aprobación" con su propio email/estado),
--    pero solo un usuario YA aprobado puede ver las filas de los demás.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Approved users can view all profiles" ON public.profiles;
CREATE POLICY "Approved users can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_approved());

-- 5. El resto de las lecturas abiertas a "cualquier autenticado" pasan a
--    requerir además estar aprobado.
DROP POLICY IF EXISTS "Projects viewable by everyone" ON public.projects;
CREATE POLICY "Projects viewable by everyone"
ON public.projects FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Tasks viewable by everyone" ON public.tasks;
CREATE POLICY "Tasks viewable by everyone"
ON public.tasks FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Authenticated users can view branch logs" ON public.branch_logs;
CREATE POLICY "Authenticated users can view branch logs"
ON public.branch_logs FOR SELECT TO authenticated
USING (public.is_approved());

DROP POLICY IF EXISTS "Authenticated users can view audits" ON public.audits;
CREATE POLICY "Authenticated users can view audits"
ON public.audits FOR SELECT TO authenticated
USING (public.is_approved());
