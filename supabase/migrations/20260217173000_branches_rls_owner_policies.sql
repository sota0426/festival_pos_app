-- branches ownership backfill + RLS policies

-- 1) Backfill owner_id / organization_id for legacy rows
UPDATE public.branches AS b
SET
  owner_id = s.user_id,
  organization_id = COALESCE(b.organization_id, s.organization_id)
FROM public.login_codes AS lc
JOIN public.subscriptions AS s
  ON s.id = lc.subscription_id
WHERE lc.branch_id = b.id
  AND b.owner_id IS NULL;

UPDATE public.branches AS b
SET owner_id = o.owner_id
FROM public.organizations AS o
WHERE b.owner_id IS NULL
  AND b.organization_id = o.id;

-- 2) Enable RLS and define branch access policies
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own branches" ON public.branches;
CREATE POLICY "Users can view own branches"
  ON public.branches
  FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own branches" ON public.branches;
CREATE POLICY "Users can insert own branches"
  ON public.branches
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own branches" ON public.branches;
CREATE POLICY "Users can update own branches"
  ON public.branches
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own branches" ON public.branches;
CREATE POLICY "Users can delete own branches"
  ON public.branches
  FOR DELETE
  USING (owner_id = auth.uid());
