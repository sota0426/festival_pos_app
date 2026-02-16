-- 3_seed_test_transactions.sql
-- Run after 2_add_dummy_data.sql
-- S900(ダミー店舗)にテスト取引を投入します

BEGIN;

-- 取引データ（重複投入防止のため transaction_code は固定）
INSERT INTO public.transactions (
  branch_id,
  transaction_code,
  total_amount,
  payment_method,
  status,
  fulfillment_status,
  created_at,
  served_at
)
SELECT
  b.id,
  tx.transaction_code,
  tx.total_amount,
  tx.payment_method,
  'completed',
  tx.fulfillment_status,
  tx.created_at,
  tx.served_at
FROM public.branches b
CROSS JOIN (
  VALUES
    ('T-S900-0001', 500, 'cash', 'served', now() - interval '90 minutes', now() - interval '85 minutes'),
    ('T-S900-0002', 1000, 'paypay', 'served', now() - interval '50 minutes', now() - interval '45 minutes'),
    ('T-S900-0003', 1500, 'voucher', 'pending', now() - interval '10 minutes', NULL)
) AS tx(transaction_code, total_amount, payment_method, fulfillment_status, created_at, served_at)
WHERE b.branch_code = 'S900'
ON CONFLICT (transaction_code) DO NOTHING;

-- 取引明細（サンプルメニュー1種類）
INSERT INTO public.transaction_items (
  transaction_id,
  menu_id,
  menu_name,
  quantity,
  unit_price,
  subtotal
)
SELECT
  t.id,
  m.id,
  m.menu_name,
  item.quantity,
  m.price,
  m.price * item.quantity
FROM public.transactions t
JOIN public.branches b
  ON b.id = t.branch_id
JOIN public.menus m
  ON m.branch_id = b.id
  AND m.menu_name = 'サンプルメニュー'
JOIN (
  VALUES
    ('T-S900-0001', 1),
    ('T-S900-0002', 2),
    ('T-S900-0003', 3)
) AS item(transaction_code, quantity)
  ON item.transaction_code = t.transaction_code
WHERE b.branch_code = 'S900'
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_items ti
    WHERE ti.transaction_id = t.id
      AND ti.menu_id = m.id
  );

COMMIT;
