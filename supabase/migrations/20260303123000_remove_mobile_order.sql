drop table if exists public.customer_order_items cascade;
drop table if exists public.customer_orders cascade;

alter table public.branches
  drop column if exists kiosk_exit_pin;
