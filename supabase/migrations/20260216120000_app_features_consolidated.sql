-- ============================================================
-- App feature consolidated migration
-- - menu_categories
-- - budget tables and constraints
-- - payment method constraints
-- - branch ownership backfill
-- - new-user bootstrap (profile/subscription/branch/menu)
-- ============================================================

-- 1) menu_categories and menus.category_id
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.menus
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_categories_branch_id ON public.menu_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_menus_category_id ON public.menus(category_id);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on menu_categories" ON public.menu_categories;
CREATE POLICY "Allow all operations on menu_categories" ON public.menu_categories
  FOR ALL USING (true) WITH CHECK (true);

-- 2) budget tables
CREATE TABLE IF NOT EXISTS public.budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  initial_budget INTEGER NOT NULL DEFAULT 0,
  target_sales INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

CREATE TABLE IF NOT EXISTS public.budget_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('material', 'decoration', 'other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  recorded_by TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online', 'cashless')),
  memo TEXT DEFAULT '',
  receipt_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_expenses
ADD COLUMN IF NOT EXISTS recorded_by TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_budget_expenses_branch_id ON public.budget_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_date ON public.budget_expenses(date);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_category ON public.budget_expenses(category);

ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to budget_settings" ON public.budget_settings;
CREATE POLICY "Allow all access to budget_settings" ON public.budget_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to budget_expenses" ON public.budget_expenses;
CREATE POLICY "Allow all access to budget_expenses" ON public.budget_expenses
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.budget_expense_summary AS
SELECT
  branch_id,
  category,
  COUNT(*) AS expense_count,
  SUM(amount) AS total_amount
FROM public.budget_expenses
GROUP BY branch_id, category;

CREATE OR REPLACE VIEW public.budget_totals AS
SELECT
  bs.branch_id,
  bs.initial_budget,
  bs.target_sales,
  COALESCE(SUM(be.amount), 0) AS total_expense,
  bs.initial_budget - COALESCE(SUM(be.amount), 0) AS remaining_budget
FROM public.budget_settings bs
LEFT JOIN public.budget_expenses be ON bs.branch_id = be.branch_id
GROUP BY bs.branch_id, bs.initial_budget, bs.target_sales;

-- 3) normalize budget_expenses.payment_method and apply final constraint
UPDATE public.budget_expenses
SET payment_method = CASE
  WHEN payment_method = 'paypay' THEN 'online'
  WHEN payment_method = 'amazon' THEN 'cashless'
  ELSE payment_method
END
WHERE payment_method IN ('paypay', 'amazon');

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.budget_expenses'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%payment_method%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.budget_expenses DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.budget_expenses
ADD CONSTRAINT budget_expenses_payment_method_check
CHECK (payment_method IN ('cash', 'online', 'cashless'));

-- 4) transactions.payment_method includes cash
ALTER TABLE public.transactions
DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_payment_method_check
CHECK (payment_method IN ('paypay', 'voucher', 'cash'));

-- 5) backfill branch ownership
UPDATE public.branches AS b
SET
  owner_id = s.user_id,
  organization_id = COALESCE(b.organization_id, s.organization_id)
FROM public.login_codes AS lc
JOIN public.subscriptions AS s
  ON s.id = lc.subscription_id
WHERE lc.branch_id = b.id
  AND (b.owner_id IS NULL OR b.organization_id IS NULL);

-- 6) bootstrap data for newly created auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_id UUID := gen_random_uuid();
  v_next_branch_number INTEGER := 1;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', COALESCE(NEW.email, '')),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_type, status)
  VALUES (NEW.id, 'free', 'active');

  SELECT
    COALESCE(
      MAX(
        CASE
          WHEN regexp_replace(branch_code, '[^0-9]', '', 'g') <> ''
            THEN regexp_replace(branch_code, '[^0-9]', '', 'g')::INT
          ELSE 0
        END
      ),
      0
    ) + 1
  INTO v_next_branch_number
  FROM public.branches;

  INSERT INTO public.branches (
    id,
    branch_code,
    branch_name,
    password,
    sales_target,
    status,
    owner_id
  )
  VALUES (
    v_branch_id,
    'S' || LPAD(v_next_branch_number::TEXT, 3, '0'),
    '店舗1',
    '0000',
    0,
    'active',
    NEW.id
  );

  INSERT INTO public.menus (
    branch_id,
    menu_name,
    price,
    menu_number,
    stock_management,
    stock_quantity,
    is_active,
    is_show
  )
  VALUES (
    v_branch_id,
    'サンプルメニュー',
    500,
    101,
    false,
    0,
    true,
    true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

