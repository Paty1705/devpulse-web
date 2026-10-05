-- CIERRA EL ACCESO DE LECTURA ANÓNIMO (hueco de seguridad deferido varias veces)
-- Ejecuta este script en el SQL Editor de Supabase
--
-- `profiles`, `projects` y `tasks` tenían políticas de SELECT con
-- `USING (true)` aplicadas al rol de Postgres `public`. En Supabase eso
-- incluye al rol `anon` que usa PostgREST para pedidos SIN sesión (la
-- "anon key" es pública por diseño, visible en cualquier pestaña de red del
-- navegador) — confirmado con curl: se podían leer todos los emails,
-- proyectos y tareas sin loguearse.
--
-- El arreglo: restringir esas mismas políticas al rol `authenticated`
-- (requiere una sesión real de Supabase Auth), sin tocar la condición
-- `USING (true)`. Ningún usuario logueado pierde visibilidad de nada que
-- vea hoy — solo se bloquea el acceso sin iniciar sesión.
--
-- No restringe MÁS ALLÁ de eso (ej. que un developer solo vea su propio
-- proyecto): eso sería un cambio de producto, no un fix de seguridad, y se
-- deja para una decisión aparte si se quiere.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Projects viewable by everyone" ON public.projects;
CREATE POLICY "Projects viewable by everyone"
ON public.projects FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Tasks viewable by everyone" ON public.tasks;
CREATE POLICY "Tasks viewable by everyone"
ON public.tasks FOR SELECT TO authenticated
USING (true);
