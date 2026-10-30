CREATE TABLE IF NOT EXISTS public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  auditor_id UUID REFERENCES public.profiles(id),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read audits" ON public.audits;
CREATE POLICY "Users can read audits" ON public.audits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "QA can insert audits" ON public.audits;
CREATE POLICY "QA can insert audits" ON public.audits FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'qa')
);

DROP POLICY IF EXISTS "QA can update audits" ON public.audits;
CREATE POLICY "QA can update audits" ON public.audits FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'qa')
);

BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audits;
COMMIT;
