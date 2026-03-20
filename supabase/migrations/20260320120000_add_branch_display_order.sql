ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS display_order INTEGER;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(
          NULLIF(regexp_replace(branch_code, '[^0-9]', '', 'g'), '')::INT,
          9999
        ),
        created_at,
        id
    ) AS next_display_order
  FROM public.branches
)
UPDATE public.branches AS branches
SET display_order = ordered.next_display_order
FROM ordered
WHERE branches.id = ordered.id
  AND (branches.display_order IS NULL OR branches.display_order <= 0);

ALTER TABLE public.branches
ALTER COLUMN display_order SET DEFAULT 1;
