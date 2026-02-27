-- シフト・引き継ぎ機能を廃止し、調理マニュアル機能へ置き換え

-- 旧テーブル（不要）
drop table if exists public.handover_notes cascade;
drop table if exists public.shift_entries cascade;

-- 新テーブル: メニュー別 調理マニュアル
create table if not exists public.menu_cooking_manuals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  ingredients text not null default '',
  purchase_source text not null default '',
  cost_per_item numeric not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_cooking_manuals_branch_menu_unique unique (branch_id, menu_id)
);

alter table public.menu_cooking_manuals enable row level security;

create policy "branch members can manage menu_cooking_manuals"
  on public.menu_cooking_manuals
  for all
  using (true)
  with check (true);

create index if not exists menu_cooking_manuals_branch_id_idx
  on public.menu_cooking_manuals(branch_id);

create index if not exists menu_cooking_manuals_menu_id_idx
  on public.menu_cooking_manuals(menu_id);
