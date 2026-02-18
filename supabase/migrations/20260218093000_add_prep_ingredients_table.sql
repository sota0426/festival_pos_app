-- prep_ingredients: 調理の下準備(材料在庫)を店舗間で共有するテーブル

CREATE TABLE IF NOT EXISTS public.prep_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '個',
  current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prep_ingredients_branch_id_idx
  ON public.prep_ingredients(branch_id);

CREATE INDEX IF NOT EXISTS prep_ingredients_branch_name_idx
  ON public.prep_ingredients(branch_id, ingredient_name);

ALTER TABLE public.prep_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prep ingredients" ON public.prep_ingredients;
CREATE POLICY "Users can view own prep ingredients"
  ON public.prep_ingredients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = prep_ingredients.branch_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own prep ingredients" ON public.prep_ingredients;
CREATE POLICY "Users can insert own prep ingredients"
  ON public.prep_ingredients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = prep_ingredients.branch_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own prep ingredients" ON public.prep_ingredients;
CREATE POLICY "Users can update own prep ingredients"
  ON public.prep_ingredients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = prep_ingredients.branch_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = prep_ingredients.branch_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own prep ingredients" ON public.prep_ingredients;
CREATE POLICY "Users can delete own prep ingredients"
  ON public.prep_ingredients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = prep_ingredients.branch_id
        AND b.owner_id = auth.uid()
    )
  );
