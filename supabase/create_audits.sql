-- TABLA DE AUDITORÍAS (revisión cruzada QA / decisión de Jefatura)
-- Ejecuta este script en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  auditor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS audits_task_id_idx ON public.audits(task_id);

-- Políticas de Seguridad (RLS)
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede ver el historial de auditoría de una tarea
-- (jefe, developer asignado y QA lo necesitan para el TaskModal).
DROP POLICY IF EXISTS "Authenticated users can view audits" ON public.audits;
CREATE POLICY "Authenticated users can view audits"
ON public.audits FOR SELECT TO authenticated
USING (true);

-- Solo QA y el jefe pueden insertar registros de auditoría, y siempre
-- identificándose a sí mismos como auditor_id.
DROP POLICY IF EXISTS "QA and jefe can insert audits" ON public.audits;
CREATE POLICY "QA and jefe can insert audits"
ON public.audits FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = auditor_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('qa', 'jefe')
  )
);
