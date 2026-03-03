-- budget_expenses: 支払い方法を4択へ更新 + 立替精算フラグ追加

-- 1) 立替精算フラグを追加
ALTER TABLE public.budget_expenses
ADD COLUMN IF NOT EXISTS is_reimbursed BOOLEAN NOT NULL DEFAULT false;

-- 2) 旧値を新値へ正規化
UPDATE public.budget_expenses
SET payment_method = CASE
  WHEN payment_method = 'paypay' THEN 'cashless'
  WHEN payment_method = 'amazon' THEN 'bank_transfer'
  WHEN payment_method = 'online' THEN 'bank_transfer'
  ELSE payment_method
END
WHERE payment_method IN ('paypay', 'amazon', 'online');

-- 3) payment_method のチェック制約を差し替え
ALTER TABLE public.budget_expenses
DROP CONSTRAINT IF EXISTS budget_expenses_payment_method_check;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.budget_expenses'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.budget_expenses DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.budget_expenses
ADD CONSTRAINT budget_expenses_payment_method_check
CHECK (payment_method IN ('cash', 'cashless', 'bank_transfer', 'advance'));
