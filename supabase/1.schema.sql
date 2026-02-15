-- Supabase Schema for Festival POS App
-- Run this SQL in your Supabase SQL Editor to create the necessary tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Branches table (支店マスタ)
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_code TEXT UNIQUE NOT NULL,
  branch_name TEXT NOT NULL,
  password TEXT NOT NULL DEFAULT '',
  sales_target INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menus table (メニューマスタ)
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  menu_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  menu_number INTEGER,
  stock_management BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_show BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table (取引履歴)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  transaction_code TEXT UNIQUE NOT NULL,
  total_amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('paypay', 'voucher', 'cash')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'served')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  served_at TIMESTAMP WITH TIME ZONE
);

-- Transaction Items table (取引明細)
CREATE TABLE IF NOT EXISTS transaction_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  menu_id UUID REFERENCES menus(id) ON DELETE SET NULL,
  menu_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

-- Visitor Counts table (来客カウント)
CREATE TABLE IF NOT EXISTS visitor_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,

  group_type TEXT NOT NULL CHECK (
    group_type IN ('group1', 'group2', 'group3', 'group4')
  ),

  count INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_menus_branch_id ON menus(branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_menus_branch_menu_number_unique ON menus(branch_id, menu_number) WHERE menu_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_branch_id ON transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_visitor_counts_branch_id ON visitor_counts(branch_id);
CREATE INDEX IF NOT EXISTS idx_visitor_counts_timestamp ON visitor_counts(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_fulfillment ON transactions(branch_id, fulfillment_status);

-- Row Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_counts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (for simplicity in this demo)
-- In production, you should implement more restrictive policies

-- Branches policies
CREATE POLICY "Allow all operations on branches" ON branches
  FOR ALL USING (true) WITH CHECK (true);

-- Menus policies
CREATE POLICY "Allow all operations on menus" ON menus
  FOR ALL USING (true) WITH CHECK (true);

-- Transactions policies
CREATE POLICY "Allow all operations on transactions" ON transactions
  FOR ALL USING (true) WITH CHECK (true);

-- Transaction Items policies
CREATE POLICY "Allow all operations on transaction_items" ON transaction_items
  FOR ALL USING (true) WITH CHECK (true);

-- Visitor Counts policies
CREATE POLICY "Allow all operations on visitor_counts" ON visitor_counts
  FOR ALL USING (true) WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for menus table
DROP TRIGGER IF EXISTS update_menus_updated_at ON menus;
CREATE TRIGGER update_menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional)
-- Uncomment the following lines to insert sample data

-- INSERT INTO branches (branch_code, branch_name, password, sales_target, status) VALUES
--   ('S001', '焼きそば屋', '1234', 50000, 'active'),
--   ('S002', 'たこ焼き屋', '1234', 40000, 'active'),
--   ('S003', 'クレープ屋', '1234', 30000, 'active');

-- Migration for existing databases:
-- ALTER TABLE branches ADD COLUMN password TEXT NOT NULL DEFAULT '';
-- UPDATE branches SET password = '1234';

-- Migration: Add fulfillment_status and served_at to transactions table
-- ALTER TABLE transactions ADD COLUMN fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'served'));
-- ALTER TABLE transactions ADD COLUMN served_at TIMESTAMP WITH TIME ZONE;
-- CREATE INDEX IF NOT EXISTS idx_transactions_fulfillment ON transactions(branch_id, fulfillment_status);
