-- ログインコード端末(anon)でも調理下準備データを同期できるようにする
-- 注意: branch_id を知っていればアクセス可能になるため、運用上の前提を確認してください

ALTER TABLE public.prep_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prep ingredients" ON public.prep_ingredients;
DROP POLICY IF EXISTS "Users can insert own prep ingredients" ON public.prep_ingredients;
DROP POLICY IF EXISTS "Users can update own prep ingredients" ON public.prep_ingredients;
DROP POLICY IF EXISTS "Users can delete own prep ingredients" ON public.prep_ingredients;

CREATE POLICY "Prep ingredients public read"
  ON public.prep_ingredients
  FOR SELECT
  USING (true);

CREATE POLICY "Prep ingredients public insert"
  ON public.prep_ingredients
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Prep ingredients public update"
  ON public.prep_ingredients
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Prep ingredients public delete"
  ON public.prep_ingredients
  FOR DELETE
  USING (true);
