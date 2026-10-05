-- NOTAS/RECORDATORIOS PERSONALES DE LA AGENDA (independientes del Kanban/proyectos)
-- Ejecuta este script en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS public.personal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS personal_events_user_date_idx ON public.personal_events(user_id, event_date);

-- Políticas de Seguridad (RLS): cada usuario solo ve y administra sus propias notas.
ALTER TABLE public.personal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own personal events" ON public.personal_events;
CREATE POLICY "Users can view their own personal events"
ON public.personal_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own personal events" ON public.personal_events;
CREATE POLICY "Users can insert their own personal events"
ON public.personal_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own personal events" ON public.personal_events;
CREATE POLICY "Users can delete their own personal events"
ON public.personal_events FOR DELETE TO authenticated
USING (auth.uid() = user_id);
