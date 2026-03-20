ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS branch_number INTEGER;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(branch_number, display_order, NULLIF(regexp_replace(branch_code, '[^0-9]', '', 'g'), '')::INT),
        created_at,
        id
    ) AS next_branch_number
  FROM public.branches
)
UPDATE public.branches AS branches
SET
  branch_number = ordered.next_branch_number,
  display_order = ordered.next_branch_number
FROM ordered
WHERE branches.id = ordered.id
  AND (branches.branch_number IS NULL OR branches.branch_number <= 0 OR branches.display_order IS NULL OR branches.display_order <= 0);
