-- =========================
-- Branches（支店）
-- =========================
INSERT INTO branches (branch_code, branch_name, password, sales_target, status)
VALUES
  ('S001', '焼きそば屋', '1234', 50000, 'active'),
  ('S002', 'たこ焼き屋', '1234', 40000, 'active'),
  ('S003', 'クレープ屋', '1234', 30000, 'active');

-- =========================
-- Menus（メニュー）
-- ※ branch_code を使って branch_id を取得
-- =========================
INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, '焼きそば（並）', 500, true, 100 FROM branches WHERE branch_code = 'S001';
INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, '焼きそば（大）', 700, true, 50 FROM branches WHERE branch_code = 'S001';

INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, 'たこ焼き（6個）', 400, true, 120 FROM branches WHERE branch_code = 'S002';
INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, 'たこ焼き（8個）', 500, true, 80 FROM branches WHERE branch_code = 'S002';

INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, 'クレープ（チョコ）', 600, false, 0 FROM branches WHERE branch_code = 'S003';
INSERT INTO menus (branch_id, menu_name, price, stock_management, stock_quantity)
SELECT id, 'クレープ（いちご）', 650, false, 0 FROM branches WHERE branch_code = 'S003';

-- =========================
-- Transactions（取引）
-- =========================
INSERT INTO transactions (branch_id, transaction_code, total_amount, payment_method)
SELECT id, 'T-S001-0001', 1200, 'paypay' FROM branches WHERE branch_code = 'S001';

INSERT INTO transactions (branch_id, transaction_code, total_amount, payment_method)
SELECT id, 'T-S002-0001', 900, 'voucher' FROM branches WHERE branch_code = 'S002';

-- =========================
-- Transaction Items（取引明細）
-- =========================
INSERT INTO transaction_items (transaction_id, menu_id, menu_name, quantity, unit_price, subtotal)
SELECT
  t.id,
  m.id,
  m.menu_name,
  2,
  m.price,
  2 * m.price
FROM transactions t
JOIN menus m ON m.menu_name = '焼きそば（並）'
WHERE t.transaction_code = 'T-S001-0001';

INSERT INTO transaction_items (transaction_id, menu_id, menu_name, quantity, unit_price, subtotal)
SELECT
  t.id,
  m.id,
  m.menu_name,
  1,
  m.price,
  m.price
FROM transactions t
JOIN menus m ON m.menu_name = '焼きそば（大）'
WHERE t.transaction_code = 'T-S001-0001';

-- =========================
-- Visitor Counts（来客数）
-- =========================
INSERT INTO visitor_counts (branch_id, count)
SELECT id, 1 FROM branches WHERE branch_code = '001';

INSERT INTO visitor_counts (branch_id, count)
SELECT id, 1 FROM branches WHERE branch_code = '002';

INSERT INTO visitor_counts (branch_id, count)
SELECT id, 1 FROM branches WHERE branch_code = '003';
