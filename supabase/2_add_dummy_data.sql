-- 2_add_dummy_data.sql
-- Run after 0_setting_table.sql

BEGIN;

-- 1店舗（存在しなければ作成）
INSERT INTO public.branches (
  branch_code,
  branch_name,
  password,
  sales_target,
  status
)
VALUES (
  'S900',
  'ダミー店舗',
  '0000',
  30000,
  'active'
)
ON CONFLICT (branch_code) DO UPDATE
SET
  branch_name = EXCLUDED.branch_name,
  password = EXCLUDED.password,
  sales_target = EXCLUDED.sales_target,
  status = EXCLUDED.status;

-- カテゴリ1件（存在しなければ作成）
INSERT INTO public.menu_categories (branch_id, category_name, sort_order)
SELECT b.id, 'ダミーカテゴリ', 1
FROM public.branches b
WHERE b.branch_code = 'S900'
  AND NOT EXISTS (
    SELECT 1
    FROM public.menu_categories mc
    WHERE mc.branch_id = b.id
      AND mc.category_name = 'ダミーカテゴリ'
  );

-- メニュー1件（存在しなければ作成）
INSERT INTO public.menus (
  branch_id,
  category_id,
  menu_name,
  price,
  menu_number,
  stock_management,
  stock_quantity,
  is_active,
  is_show
)
SELECT
  b.id,
  mc.id,
  'サンプルメニュー',
  500,
  101,
  false,
  0,
  true,
  true
FROM public.branches b
LEFT JOIN public.menu_categories mc
  ON mc.branch_id = b.id
  AND mc.category_name = 'ダミーカテゴリ'
WHERE b.branch_code = 'S900'
  AND NOT EXISTS (
    SELECT 1
    FROM public.menus m
    WHERE m.branch_id = b.id
      AND m.menu_name = 'サンプルメニュー'
  );

-- 予算設定1件（存在しなければ作成）
INSERT INTO public.budget_settings (branch_id, initial_budget, target_sales)
SELECT b.id, 100000, 300000
FROM public.branches b
WHERE b.branch_code = 'S900'
ON CONFLICT (branch_id) DO NOTHING;

COMMIT;
