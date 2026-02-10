-- Migration: Add menu_categories table and category_id to menus
-- カテゴリテーブルの追加とメニューへのカテゴリ紐付け

-- 1. Create menu_categories table (メニューカテゴリマスタ)
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add category_id column to menus table
ALTER TABLE menus ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_menu_categories_branch_id ON menu_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_menus_category_id ON menus(category_id);

-- 4. Enable RLS on menu_categories
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policy (same pattern as other tables)
CREATE POLICY "Allow all operations on menu_categories" ON menu_categories
  FOR ALL USING (true) WITH CHECK (true);
