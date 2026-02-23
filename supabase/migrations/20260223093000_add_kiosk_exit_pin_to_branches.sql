ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS kiosk_exit_pin text;

COMMENT ON COLUMN public.branches.kiosk_exit_pin IS '店舗共通のモバイルオーダーキオスク解除PIN（4-6桁想定）';
