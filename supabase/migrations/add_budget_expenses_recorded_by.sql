ALTER TABLE public.budget_expenses
ADD COLUMN IF NOT EXISTS recorded_by TEXT NOT NULL DEFAULT '';
