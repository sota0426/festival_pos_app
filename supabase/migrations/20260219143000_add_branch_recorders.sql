-- 登録者設定: 店舗ごとの登録者マスタ + 端末アクセスログ

CREATE TABLE IF NOT EXISTS public.branch_recorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  recorder_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  group_id INTEGER NOT NULL DEFAULT 1 CHECK (group_id BETWEEN 1 AND 9),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, recorder_name)
);

CREATE INDEX IF NOT EXISTS branch_recorders_branch_id_idx
  ON public.branch_recorders(branch_id);

CREATE TABLE IF NOT EXISTS public.branch_recorder_configs (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  registration_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (registration_mode IN ('open', 'restricted')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.branch_recorder_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  recorder_id UUID NULL REFERENCES public.branch_recorders(id) ON DELETE SET NULL,
  recorder_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS branch_recorder_access_logs_branch_id_idx
  ON public.branch_recorder_access_logs(branch_id);

CREATE INDEX IF NOT EXISTS branch_recorder_access_logs_recorder_name_idx
  ON public.branch_recorder_access_logs(branch_id, recorder_name);

CREATE INDEX IF NOT EXISTS branch_recorder_access_logs_accessed_at_idx
  ON public.branch_recorder_access_logs(accessed_at DESC);

ALTER TABLE public.branch_recorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_recorder_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_recorder_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recorder public read" ON public.branch_recorders;
DROP POLICY IF EXISTS "Recorder public insert" ON public.branch_recorders;
DROP POLICY IF EXISTS "Recorder public update" ON public.branch_recorders;
DROP POLICY IF EXISTS "Recorder public delete" ON public.branch_recorders;

CREATE POLICY "Recorder public read"
  ON public.branch_recorders
  FOR SELECT
  USING (true);

CREATE POLICY "Recorder public insert"
  ON public.branch_recorders
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Recorder public update"
  ON public.branch_recorders
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Recorder public delete"
  ON public.branch_recorders
  FOR DELETE
  USING (true);

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

DROP POLICY IF EXISTS "Recorder logs public read" ON public.branch_recorder_access_logs;
DROP POLICY IF EXISTS "Recorder logs public insert" ON public.branch_recorder_access_logs;
DROP POLICY IF EXISTS "Recorder logs public update" ON public.branch_recorder_access_logs;
DROP POLICY IF EXISTS "Recorder logs public delete" ON public.branch_recorder_access_logs;

CREATE POLICY "Recorder logs public read"
  ON public.branch_recorder_access_logs
  FOR SELECT
  USING (true);

CREATE POLICY "Recorder logs public insert"
  ON public.branch_recorder_access_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Recorder logs public update"
  ON public.branch_recorder_access_logs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Recorder logs public delete"
  ON public.branch_recorder_access_logs
  FOR DELETE
  USING (true);
