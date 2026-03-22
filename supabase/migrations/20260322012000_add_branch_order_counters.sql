CREATE TABLE IF NOT EXISTS public.branch_order_counters (
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  counter_date DATE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('transaction', 'mobile_order')),
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, counter_date, scope)
);

ALTER TABLE public.branch_order_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.allocate_branch_order_number(
  p_branch_id UUID,
  p_scope TEXT DEFAULT 'transaction'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := timezone('Asia/Tokyo', now())::date;
  v_next INTEGER;
BEGIN
  IF p_scope NOT IN ('transaction', 'mobile_order') THEN
    RAISE EXCEPTION 'Unsupported scope: %', p_scope;
  END IF;

  INSERT INTO public.branch_order_counters (
    branch_id,
    counter_date,
    scope,
    last_value,
    updated_at
  )
  VALUES (
    p_branch_id,
    v_today,
    p_scope,
    1,
    now()
  )
  ON CONFLICT (branch_id, counter_date, scope)
  DO UPDATE
  SET
    last_value = CASE
      WHEN public.branch_order_counters.last_value >= 99 THEN 1
      ELSE public.branch_order_counters.last_value + 1
    END,
    updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_branch_order_number(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.allocate_branch_order_number(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_branch_order_number(UUID, TEXT) TO service_role;
