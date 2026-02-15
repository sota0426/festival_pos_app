-- Migration: Add 'cash' to transactions payment_method check constraint
-- The original constraint only allowed ('paypay', 'voucher') but the app also supports 'cash'

-- Drop the existing check constraint
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_payment_method_check;

-- Re-add with 'cash' included
ALTER TABLE transactions
ADD CONSTRAINT transactions_payment_method_check
CHECK (payment_method IN ('paypay', 'voucher', 'cash'));
