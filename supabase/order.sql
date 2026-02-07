ALTER TABLE transactions ADD COLUMN fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'served'));
ALTER TABLE transactions ADD COLUMN served_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_transactions_fulfillment ON transactions(branch_id, fulfillment_status);
