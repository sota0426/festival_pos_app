-- Mobile order request flow
-- Customer submits request from QR page, staff imports request into register cart.

create table if not exists public.mobile_order_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_number text not null,
  status text not null default 'requested' check (status in ('requested', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_order_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mobile_order_requests(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete restrict,
  menu_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_mobile_order_requests_branch_status_created
  on public.mobile_order_requests(branch_id, status, created_at desc);

create index if not exists idx_mobile_order_request_items_request
  on public.mobile_order_request_items(request_id);

drop trigger if exists mobile_order_requests_set_updated_at on public.mobile_order_requests;
create trigger mobile_order_requests_set_updated_at
  before update on public.mobile_order_requests
  for each row execute function public.set_updated_at();

alter table public.mobile_order_requests enable row level security;
alter table public.mobile_order_request_items enable row level security;

drop policy if exists "mobile_order_requests_public_select" on public.mobile_order_requests;
create policy "mobile_order_requests_public_select"
  on public.mobile_order_requests
  for select
  using (true);

drop policy if exists "mobile_order_requests_public_insert" on public.mobile_order_requests;
create policy "mobile_order_requests_public_insert"
  on public.mobile_order_requests
  for insert
  with check (true);

drop policy if exists "mobile_order_requests_public_update" on public.mobile_order_requests;
create policy "mobile_order_requests_public_update"
  on public.mobile_order_requests
  for update
  using (true)
  with check (true);

drop policy if exists "mobile_order_request_items_public_select" on public.mobile_order_request_items;
create policy "mobile_order_request_items_public_select"
  on public.mobile_order_request_items
  for select
  using (true);

drop policy if exists "mobile_order_request_items_public_insert" on public.mobile_order_request_items;
create policy "mobile_order_request_items_public_insert"
  on public.mobile_order_request_items
  for insert
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.mobile_order_requests;
exception
  when duplicate_object then null;
end $$;
