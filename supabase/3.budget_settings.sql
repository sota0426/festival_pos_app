-- budget_settings テーブル（支店ごとに1レコード）
CREATE TABLE budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  initial_budget INTEGER NOT NULL DEFAULT 0,
  target_sales INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id)
);

-- budget_expenses テーブル（支出明細）
CREATE TABLE budget_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('material','decoration','other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  recorded_by TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','online','cashless')),
  memo TEXT DEFAULT '',
  receipt_image TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- + インデックス、RLSポリシー、集計ビュー
