-- =====================================================================
-- Tablero de recursos: ajustes sobre la tabla `resources`
-- (creada en area_personalizacion.sql, sección 5).
--
-- 1. Solo un jefe puede fijar recursos (antes el autor también podía
--    hacerlo editando su fila).
-- 2. Aviso al integrante cuando alguien le recomienda algo a él.
-- 3. La tabla entra a Realtime para que el tablero se actualice solo.
--
-- Se puede correr varias veces.
-- =====================================================================

-- 1. Fijar es decisión del jefe ------------------------------------------
CREATE OR REPLACE FUNCTION public.resources_guard_pinned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_jefe() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.pinned := false;
  ELSIF NEW.pinned IS DISTINCT FROM OLD.pinned THEN
    RAISE EXCEPTION 'Solo un jefe puede fijar recursos.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resources_guard_pinned ON public.resources;
CREATE TRIGGER resources_guard_pinned
BEFORE INSERT OR UPDATE ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.resources_guard_pinned();

-- 2. Aviso de recomendación personal --------------------------------------
CREATE OR REPLACE FUNCTION public.notify_resource_recommended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who TEXT;
BEGIN
  IF NEW.recommended_for IS NULL OR NEW.recommended_for = auth.uid() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.recommended_for IS NOT DISTINCT FROM OLD.recommended_for THEN
    RETURN NEW;
  END IF;
  SELECT split_part(email, '@', 1) INTO who FROM public.profiles WHERE id = NEW.recommended_by;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (
    NEW.recommended_for,
    'resource',
    'Te recomendaron: ' || NEW.title,
    coalesce(who, 'Alguien del equipo') || ' te recomendó este ' ||
      CASE NEW.kind WHEN 'video' THEN 'video' WHEN 'documento' THEN 'documento' ELSE 'enlace' END || '.',
    '/dashboard/recursos?para=mi'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_resource_recommended ON public.resources;
CREATE TRIGGER notify_resource_recommended
AFTER INSERT OR UPDATE OF recommended_for ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.notify_resource_recommended();

REVOKE EXECUTE ON FUNCTION public.resources_guard_pinned() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_resource_recommended() FROM anon, public;

-- 3. Realtime --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'resources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resources;
  END IF;
END $$;
