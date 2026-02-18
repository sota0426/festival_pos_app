-- =================================================================
-- Customer Orders Feature
-- Migration: 20260219120000_add_customer_orders
--
-- 変更内容:
--   1. branches_public ビュー作成 (id, branch_code, branch_name のみ公開)
--   2. menus テーブルへ公開 SELECT ポリシー追加 (客側からの未ログイン取得)
--   3. menu_categories テーブルへ公開 SELECT ポリシー確認 (既存の FOR ALL USING(true) で対応済み)
--   4. customer_orders テーブル作成
--   5. customer_order_items テーブル作成
--   6. インデックス・トリガー作成
--   7. RLS ポリシー設定
--   8. Realtime 有効化
-- =================================================================


-- -----------------------------------------------------------------
-- 1. branches_public ビュー
--    客側画面は branch_code からの検索のみ許可。
--    password / sales_target 等の機密カラムは含めない。
-- -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.branches_public AS
  SELECT
    id,
    branch_code,
    branch_name
  FROM public.branches;

-- anon ロールに SELECT のみ付与
GRANT SELECT ON public.branches_public TO anon;
GRANT SELECT ON public.branches_public TO authenticated;


-- -----------------------------------------------------------------
-- 2. menus テーブル: 公開 SELECT ポリシー
--    RLS は有効だがポリシー定義なし → anon からブロックされる状態を解消。
--    INSERT / UPDATE / DELETE は引き続き既存の認証フローに委ねる。
--    ※ 客側画面は READ のみ使用するため SELECT のみ公開で十分。
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Menus: public select" ON public.menus;
CREATE POLICY "Menus: public select"
  ON public.menus
  FOR SELECT
  USING (true);


-- -----------------------------------------------------------------
-- 3. customer_orders テーブル
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  session_id       TEXT        NOT NULL,
  -- identifier_type: 'table' = QRコード卓番号, 'device' = タブレット端末名
  identifier_type  TEXT        NOT NULL CHECK (identifier_type IN ('table', 'device')),
  -- table_identifier: 生の値 "3" or "タブレットA"
  table_identifier TEXT        NOT NULL,
  -- display_label: 表示用ラベル "テーブル3番" or "タブレットA"
  display_label    TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
  -- order_number: スタッフ向け短縮コード "S001-0421"
  order_number     TEXT        NOT NULL,
  note             TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------
-- 4. customer_order_items テーブル
--    注文時点のメニュー情報をスナップショット保存
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_order_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID    NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  -- menu_id は削除時 NULL になる可能性あり (SET NULL)
  menu_id     UUID    REFERENCES public.menus(id) ON DELETE SET NULL,
  menu_name   TEXT    NOT NULL,
  unit_price  INTEGER NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  subtotal    INTEGER NOT NULL
);


-- -----------------------------------------------------------------
-- 5. インデックス
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customer_orders_branch_id
  ON public.customer_orders(branch_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_branch_status
  ON public.customer_orders(branch_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_orders_created_at
  ON public.customer_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_order_id
  ON public.customer_order_items(order_id);


-- -----------------------------------------------------------------
-- 6. updated_at 自動更新トリガー
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_orders_set_updated_at ON public.customer_orders;
CREATE TRIGGER customer_orders_set_updated_at
  BEFORE UPDATE ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------
ALTER TABLE public.customer_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_order_items ENABLE ROW LEVEL SECURITY;

-- customer_orders: 誰でも INSERT 可 (客が注文申請)
DROP POLICY IF EXISTS "Customer orders: public insert" ON public.customer_orders;
CREATE POLICY "Customer orders: public insert"
  ON public.customer_orders
  FOR INSERT
  WITH CHECK (true);

-- customer_orders: 誰でも SELECT 可 (スタッフ・客どちらもアクセス)
DROP POLICY IF EXISTS "Customer orders: public select" ON public.customer_orders;
CREATE POLICY "Customer orders: public select"
  ON public.customer_orders
  FOR SELECT
  USING (true);

-- customer_orders: UPDATE 可 (スタッフが status 変更: accepted / completed / cancelled)
DROP POLICY IF EXISTS "Customer orders: public update" ON public.customer_orders;
CREATE POLICY "Customer orders: public update"
  ON public.customer_orders
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- customer_order_items: 誰でも INSERT / SELECT 可
DROP POLICY IF EXISTS "Customer order items: public insert" ON public.customer_order_items;
CREATE POLICY "Customer order items: public insert"
  ON public.customer_order_items
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Customer order items: public select" ON public.customer_order_items;
CREATE POLICY "Customer order items: public select"
  ON public.customer_order_items
  FOR SELECT
  USING (true);


-- -----------------------------------------------------------------
-- 8. Realtime 有効化
--    スタッフ側がリアルタイムで新規注文を受信できるようにする
-- -----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_orders;
