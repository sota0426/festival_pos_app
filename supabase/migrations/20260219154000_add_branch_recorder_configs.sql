CREATE TABLE IF NOT EXISTS public.branch_recorder_configs (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  registration_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (registration_mode IN ('open', 'restricted')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.branch_recorder_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recorder config public read" ON public.branch_recorder_configs;
DROP POLICY IF EXISTS "Recorder config public insert" ON public.branch_recorder_configs;
DROP POLICY IF EXISTS "Recorder config public update" ON public.branch_recorder_configs;
DROP POLICY IF EXISTS "Recorder config public delete" ON public.branch_recorder_configs;

CREATE POLICY "Recorder config public read"
  ON public.branch_recorder_configs
  FOR SELECT
  USING (true);

CREATE POLICY "Recorder config public insert"
  ON public.branch_recorder_configs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Recorder config public update"
  ON public.branch_recorder_configs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Recorder config public delete"
  ON public.branch_recorder_configs
  FOR DELETE
  USING (true);
