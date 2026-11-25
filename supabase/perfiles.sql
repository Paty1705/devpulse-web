-- =====================================================================
-- Perfiles: información de presentación de cada integrante.
--
-- Va en una tabla aparte de `profiles` a propósito: ahí viven el rol y el
-- estado, que solo un jefe puede cambiar. Aquí cada quien edita lo suyo y
-- todo usuario aprobado puede leerlo.
--
-- Del cumpleaños solo se guardan día y mes (sin año).
--
-- Se puede correr varias veces.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.profile_info (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name   TEXT CHECK (char_length(full_name) <= 80),
  specialties TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(specialties) <= 12),
  about       TEXT CHECK (char_length(about) <= 600),
  birth_day   SMALLINT,
  birth_month SMALLINT,
  hobbies     TEXT CHECK (char_length(hobbies) <= 200),
  phone       TEXT CHECK (char_length(phone) <= 30),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_info_birthday CHECK (
    (birth_day IS NULL AND birth_month IS NULL)
    OR (
      birth_day IS NOT NULL AND birth_month IS NOT NULL
      AND birth_month BETWEEN 1 AND 12
      AND birth_day BETWEEN 1 AND CASE
        WHEN birth_month = 2 THEN 29
        WHEN birth_month IN (4, 6, 9, 11) THEN 30
        ELSE 31
      END
    )
  )
);

ALTER TABLE public.profile_info ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profile_info FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profile_info TO authenticated;

DROP POLICY IF EXISTS "profile_info_select" ON public.profile_info;
CREATE POLICY "profile_info_select" ON public.profile_info
  FOR SELECT TO authenticated
  USING (public.is_approved());

DROP POLICY IF EXISTS "profile_info_insert_own" ON public.profile_info;
CREATE POLICY "profile_info_insert_own" ON public.profile_info
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_approved());

DROP POLICY IF EXISTS "profile_info_update_own" ON public.profile_info;
CREATE POLICY "profile_info_update_own" ON public.profile_info
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_approved())
  WITH CHECK (user_id = auth.uid() AND public.is_approved());

-- Datos iniciales con lo que ya se sabe: nombre de la cuenta y especialidad.
INSERT INTO public.profile_info (user_id, full_name, specialties)
SELECT
  p.id,
  left(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 80),
  CASE p.specialty
    WHEN 'frontend' THEN ARRAY['Frontend']
    WHEN 'backend' THEN ARRAY['Backend']
    WHEN 'fullstack' THEN ARRAY['Full stack']
    WHEN 'bases_de_datos' THEN ARRAY['Bases de datos']
    WHEN 'devops' THEN ARRAY['DevOps']
    WHEN 'movil' THEN ARRAY['Móvil']
    ELSE '{}'::TEXT[]
  END
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ON CONFLICT (user_id) DO NOTHING;
