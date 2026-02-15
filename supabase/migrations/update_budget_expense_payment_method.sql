UPDATE public.budget_expenses
SET payment_method = CASE
  WHEN payment_method = 'paypay' THEN 'online'
  WHEN payment_method = 'amazon' THEN 'cashless'
  ELSE payment_method
END
WHERE payment_method IN ('paypay', 'amazon');

DO $$
DECLARE
  constraint_name text;
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
