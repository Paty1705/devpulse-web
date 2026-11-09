-- =====================================================================
-- Juntas programadas: repetición, recordatorio y Google Calendar.
--
-- 1. meeting_series: una junta que se repite (diaria, semanal o mensual,
--    cada N) a la misma hora. Siempre hay UNA junta próxima creada por
--    serie; cuando esa termina, se cancela o se borra, se crea la
--    siguiente. Así los invitados la ven y reciben su aviso con tiempo.
-- 2. Recordatorio: N minutos antes (15 por defecto) llega una
--    notificación a cada asistente. Si cambia la hora, se vuelve a avisar.
-- 3. Columnas para ligar con Google Calendar (evento e enlace de Meet).
-- 4. pg_cron revisa cada minuto (consulta muy ligera).
--
-- Usa public.next_occurrence() de tareas_repetitivas.sql.
-- Se puede correr varias veces.
-- =====================================================================

-- 1. Series ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  -- Primera junta: su fecha es el ancla y su hora (en CDMX) se repite.
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('diaria', 'semanal', 'mensual')),
  every_n SMALLINT NOT NULL DEFAULT 1 CHECK (every_n BETWEEN 1 AND 52),
  end_date DATE,
  attendee_ids UUID[] NOT NULL DEFAULT '{}',
  reminder_minutes SMALLINT DEFAULT 15 CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 1440),
  google_event_id TEXT,
  video_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  -- Última junta que se generó (para no repetir una que se borró).
  last_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.meeting_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users view series" ON public.meeting_series;
CREATE POLICY "Approved users view series"
ON public.meeting_series FOR SELECT TO authenticated
USING (public.is_approved() AND (public.is_jefe() OR auth.uid() = ANY (attendee_ids)));

DROP POLICY IF EXISTS "Jefes manage series" ON public.meeting_series;
CREATE POLICY "Jefes manage series"
ON public.meeting_series FOR ALL TO authenticated
USING (public.is_jefe())
WITH CHECK (public.is_jefe());

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.meeting_series(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS reminder_minutes SMALLINT DEFAULT 15
  CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 1440);
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS video_url TEXT;
CREATE INDEX IF NOT EXISTS meetings_series_idx ON public.meetings(series_id);
CREATE INDEX IF NOT EXISTS meetings_reminder_idx ON public.meetings(scheduled_at) WHERE status = 'programada' AND reminder_sent_at IS NULL;

-- Siguiente junta de la serie estrictamente después de p_after.
CREATE OR REPLACE FUNCTION public.series_next_at(s public.meeting_series, p_after TIMESTAMP WITH TIME ZONE)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  tz CONSTANT TEXT := 'America/Mexico_City';
  anchor_local TIMESTAMP := s.starts_at AT TIME ZONE tz;
  day DATE := public.next_occurrence(anchor_local::DATE, s.frequency, s.every_n, (p_after AT TIME ZONE tz)::DATE);
  candidate TIMESTAMP WITH TIME ZONE;
  guard INTEGER := 0;
BEGIN
  LOOP
    candidate := (day + anchor_local::TIME) AT TIME ZONE tz;
    EXIT WHEN candidate > p_after OR guard > 3;
    day := public.next_occurrence(anchor_local::DATE, s.frequency, s.every_n, day + 1);
    guard := guard + 1;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Crea la próxima junta de cada serie activa que no tenga una pendiente.
CREATE OR REPLACE FUNCTION public.ensure_series_meetings(p_only UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.meeting_series%ROWTYPE;
  v_at TIMESTAMP WITH TIME ZONE;
  v_prev TIMESTAMP WITH TIME ZONE;
  v_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR s IN
    SELECT * FROM public.meeting_series
    WHERE active AND (p_only IS NULL OR id = p_only)
    FOR UPDATE SKIP LOCKED
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.series_id = s.id AND m.status IN ('programada', 'en_curso')
    );

    v_at := public.series_next_at(s, greatest(coalesce(s.last_at, s.starts_at - interval '1 second'), now() - interval '1 minute'));

    IF s.end_date IS NOT NULL AND (v_at AT TIME ZONE 'America/Mexico_City')::DATE > s.end_date THEN
      UPDATE public.meeting_series SET active = false WHERE id = s.id;
      CONTINUE;
    END IF;

    -- Se revisan los avances desde la junta anterior de la serie.
    SELECT max(scheduled_at) INTO v_prev FROM public.meetings WHERE series_id = s.id AND status = 'terminada';

    INSERT INTO public.meetings (title, scheduled_at, review_from, created_by, series_id, reminder_minutes, video_url)
    VALUES (
      s.title, v_at,
      coalesce((v_prev AT TIME ZONE 'America/Mexico_City')::DATE, ((v_at AT TIME ZONE 'America/Mexico_City')::DATE - 7)),
      s.created_by, s.id, s.reminder_minutes, s.video_url
    )
    RETURNING id INTO v_id;

    INSERT INTO public.meeting_attendees (meeting_id, user_id)
    SELECT v_id, p.id FROM public.profiles p
    WHERE p.id = ANY (s.attendee_ids) AND p.status = 'approved'
    ON CONFLICT DO NOTHING;

    UPDATE public.meeting_series SET last_at = v_at WHERE id = s.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_series_meetings(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ensure_series_meetings(UUID) TO authenticated;

-- Al crear o reanudar una serie, se crea su primera junta de inmediato.
CREATE OR REPLACE FUNCTION public.meeting_series_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active THEN
    PERFORM public.ensure_series_meetings(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meeting_series_after ON public.meeting_series;
CREATE TRIGGER meeting_series_after
AFTER INSERT OR UPDATE OF active ON public.meeting_series
FOR EACH ROW EXECUTE FUNCTION public.meeting_series_after();

-- Cuando la junta de una serie termina, se cancela o se borra, sigue la próxima.
CREATE OR REPLACE FUNCTION public.meetings_series_next()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.series_id ELSE NEW.series_id END;
BEGIN
  IF sid IS NOT NULL THEN
    PERFORM public.ensure_series_meetings(sid);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meetings_series_next ON public.meetings;
CREATE TRIGGER meetings_series_next
AFTER UPDATE OF status OR DELETE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.meetings_series_next();

-- 2. Recordatorios ---------------------------------------------------------------
-- Si se mueve la hora o el aviso, se vuelve a mandar.
CREATE OR REPLACE FUNCTION public.meetings_reset_reminder()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.scheduled_at, NEW.reminder_minutes) IS DISTINCT FROM (OLD.scheduled_at, OLD.reminder_minutes) THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meetings_reset_reminder ON public.meetings;
CREATE TRIGGER meetings_reset_reminder
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.meetings_reset_reminder();

CREATE OR REPLACE FUNCTION public.send_meeting_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.meetings%ROWTYPE;
  v_count INTEGER := 0;
  v_when TEXT;
BEGIN
  FOR m IN
    SELECT * FROM public.meetings
    WHERE status = 'programada'
      AND reminder_sent_at IS NULL
      AND reminder_minutes IS NOT NULL
      AND scheduled_at - make_interval(mins => reminder_minutes) <= now()
      -- No avisar de juntas que ya pasaron hace rato.
      AND scheduled_at > now() - interval '10 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_when := CASE
      WHEN m.reminder_minutes = 0 THEN 'Empieza ahora'
      WHEN m.reminder_minutes < 60 THEN 'En ' || m.reminder_minutes || ' min'
      WHEN m.reminder_minutes = 60 THEN 'En 1 hora'
      WHEN m.reminder_minutes < 1440 THEN 'En ' || (m.reminder_minutes / 60) || ' horas'
      ELSE 'Mañana'
    END;
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT DISTINCT u, 'meeting_reminder', v_when || ': ' || m.title,
      'La junta es a las ' || to_char(m.scheduled_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI') ||
        CASE WHEN m.video_url IS NOT NULL THEN '. Tiene enlace de videollamada.' ELSE '.' END,
      '/dashboard/juntas/' || m.id
    FROM (
      SELECT a.user_id AS u FROM public.meeting_attendees a WHERE a.meeting_id = m.id
      UNION SELECT m.created_by WHERE m.created_by IS NOT NULL
    ) people;
    UPDATE public.meetings SET reminder_sent_at = now() WHERE id = m.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_meeting_reminders() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.meeting_series_after() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.meetings_series_next() FROM anon, public;

-- 3. Realtime para la lista de juntas ------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meeting_series'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_series;
  END IF;
END $$;

-- 4. pg_cron -------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'juntas-recordatorios-y-series';
  PERFORM cron.schedule(
    'juntas-recordatorios-y-series',
    '* * * * *',
    'SELECT public.send_meeting_reminders(); SELECT public.ensure_series_meetings();'
  );
END $$;
