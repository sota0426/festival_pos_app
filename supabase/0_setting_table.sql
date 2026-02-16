-- 0_setting_table.sql
-- Run this first in Supabase SQL Editor

-- ============================================================
-- SaaS化マイグレーション: プロフィール、組織、サブスクリプション、ログインコード
-- ============================================================

-- profiles: Supabase Auth ユーザーに紐づくプロフィール
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- profiles に INSERT ポリシーを追加（トリガーは SECURITY DEFINER だが念のため）
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- organizations: 団体アカウント
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- organization_members: ユーザーと団体の紐付け
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- subscriptions: Stripe サブスクリプション状態
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'store', 'organization')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- subscriptions に INSERT ポリシーを追加（トリガー経由での作成用）
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- login_codes: 店舗共有ログインコード
CREATE TABLE IF NOT EXISTS login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE login_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own login codes" ON login_codes;
CREATE POLICY "Users can view own login codes"
  ON login_codes FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can manage own login codes" ON login_codes;
CREATE POLICY "Users can manage own login codes"
  ON login_codes FOR ALL
  USING (auth.uid() = created_by);

-- login_codes は Edge Function (service_role) 経由でも検証可能

-- ============================================================
-- branches テーブルに組織・オーナーカラム追加
-- ============================================================
ALTER TABLE branches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_login_codes_code ON login_codes(code);
CREATE INDEX IF NOT EXISTS idx_login_codes_branch ON login_codes(branch_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_branches_owner ON branches(owner_id);

-- ============================================================
-- RLS: organizations は メンバーのみアクセス可
-- ============================================================
DROP POLICY IF EXISTS "Org members can view organization" ON organizations;
CREATE POLICY "Org members can view organization"
  ON organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org owner can update organization" ON organizations;
CREATE POLICY "Org owner can update organization"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- RLS: organization_members
-- ============================================================
DROP POLICY IF EXISTS "Members can view their org memberships" ON organization_members;
CREATE POLICY "Members can view their org memberships"
  ON organization_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org owner can manage members" ON organization_members;
CREATE POLICY "Org owner can manage members"
  ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- Auth trigger: 新規ユーザー作成時にプロフィール+無料サブスクを自動作成
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', COALESCE(NEW.email, '')),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.subscriptions (user_id, plan_type, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

