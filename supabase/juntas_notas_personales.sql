-- JUNTAS: NOTAS PERSONALES
-- Ejecuta este script en el SQL Editor de Supabase (ya aplicado como la
-- migración "juntas_notas_personales"). Es idempotente.
--
-- Cada asistente (y el jefe) toma sus propias notas de la junta. Son
-- privadas: solo su autor las ve. Las notas generales de la junta siguen
-- en meetings.notes (las edita el jefe, las ven todos los asistentes).

CREATE TABLE IF NOT EXISTS public.meeting_notes (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (meeting_id, user_id)
);

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own meeting notes" ON public.meeting_notes;
CREATE POLICY "Users read their own meeting notes"
ON public.meeting_notes FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Attendees write their own meeting notes" ON public.meeting_notes;
CREATE POLICY "Attendees write their own meeting notes"
ON public.meeting_notes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_approved()
  AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id))
);

DROP POLICY IF EXISTS "Attendees update their own meeting notes" ON public.meeting_notes;
CREATE POLICY "Attendees update their own meeting notes"
ON public.meeting_notes FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (public.is_jefe() OR public.is_meeting_attendee(meeting_id))
);

DROP POLICY IF EXISTS "Users delete their own meeting notes" ON public.meeting_notes;
CREATE POLICY "Users delete their own meeting notes"
ON public.meeting_notes FOR DELETE TO authenticated
USING (user_id = auth.uid());
