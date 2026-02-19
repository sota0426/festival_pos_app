ALTER TABLE public.branch_recorders
  ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_id INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branch_recorders_group_id_check'
      AND conrelid = 'public.branch_recorders'::regclass
  ) THEN
    ALTER TABLE public.branch_recorders
      ADD CONSTRAINT branch_recorders_group_id_check CHECK (group_id BETWEEN 1 AND 9);
  END IF;
END $$;
