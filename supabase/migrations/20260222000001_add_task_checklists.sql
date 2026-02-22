-- 仕事チェックリスト
create table if not exists public.task_checklists (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  done_by text,
  note text not null default '',
  category text not null default 'その他',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_checklists enable row level security;

create policy "branch members can manage task_checklists"
  on public.task_checklists
  for all
  using (true)
  with check (true);

create index if not exists task_checklists_branch_id_idx on public.task_checklists(branch_id);
