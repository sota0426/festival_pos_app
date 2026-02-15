-- ============================================
-- 予算管理テーブル (Budget Management Tables)
-- ============================================

-- 1. 予算設定テーブル
CREATE TABLE IF NOT EXISTS budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  initial_budget INTEGER NOT NULL DEFAULT 0,
  target_sales INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

-- 2. 支出テーブル
CREATE TABLE IF NOT EXISTS budget_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('material', 'decoration', 'other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  recorded_by TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online', 'cashless')),
  memo TEXT DEFAULT '',
  receipt_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_budget_expenses_branch_id ON budget_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_date ON budget_expenses(date);
CREATE INDEX IF NOT EXISTS idx_budget_expenses_category ON budget_expenses(category);

-- RLS (Row Level Security) ポリシー
ALTER TABLE budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_expenses ENABLE ROW LEVEL SECURITY;

-- anon ユーザーにすべてのアクセスを許可（既存テーブルと同じパターン）
CREATE POLICY "Allow all access to budget_settings" ON budget_settings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to budget_expenses" ON budget_expenses
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 集計ビュー (Aggregation Views)
-- ============================================

-- 支店別支出サマリービュー
CREATE OR REPLACE VIEW budget_expense_summary AS
SELECT
  branch_id,
  category,
  COUNT(*) AS expense_count,
  SUM(amount) AS total_amount
FROM budget_expenses
GROUP BY branch_id, category;

-- 支店別支出合計ビュー
CREATE OR REPLACE VIEW budget_totals AS
SELECT
  bs.branch_id,
  bs.initial_budget,
  bs.target_sales,
  COALESCE(SUM(be.amount), 0) AS total_expense,
  bs.initial_budget - COALESCE(SUM(be.amount), 0) AS remaining_budget
FROM budget_settings bs
LEFT JOIN budget_expenses be ON bs.branch_id = be.branch_id
GROUP BY bs.branch_id, bs.initial_budget, bs.target_sales;
