-- シフト一覧
create table if not exists public.shift_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_name text not null,
  start_time text not null default '',
  end_time text not null default '',
  members text not null default '',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_entries enable row level security;

create policy "branch members can manage shift_entries"
  on public.shift_entries
  for all
  using (true)
  with check (true);

create index if not exists shift_entries_branch_id_idx on public.shift_entries(branch_id);

-- 引き継ぎメモ
create table if not exists public.handover_notes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  from_shift text not null default '',
  to_shift text not null default '',
  content text not null,
  created_by text not null default '',
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.handover_notes enable row level security;

create policy "branch members can manage handover_notes"
  on public.handover_notes
  for all
  using (true)
  with check (true);

create index if not exists handover_notes_branch_id_idx on public.handover_notes(branch_id);
