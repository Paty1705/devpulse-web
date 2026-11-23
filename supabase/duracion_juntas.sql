-- =====================================================================
-- Duración de las juntas.
-- La duración (en minutos) se elige al crear la junta; en la sala se avisa
-- cuando se excede y el jefe puede extenderla. Se puede correr varias veces.
-- =====================================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT NOT NULL DEFAULT 60
  CHECK (duration_minutes BETWEEN 5 AND 720);

ALTER TABLE public.meeting_series
  ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT NOT NULL DEFAULT 60
  CHECK (duration_minutes BETWEEN 5 AND 720);

-- Las juntas que genera una serie heredan su duración (sin reescribir la
-- función que las crea).
CREATE OR REPLACE FUNCTION public.meeting_inherit_series_duration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.series_id IS NOT NULL THEN
    SELECT duration_minutes INTO NEW.duration_minutes FROM public.meeting_series WHERE id = NEW.series_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_inherit_series_duration ON public.meetings;
CREATE TRIGGER meeting_inherit_series_duration
  BEFORE INSERT ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meeting_inherit_series_duration();
