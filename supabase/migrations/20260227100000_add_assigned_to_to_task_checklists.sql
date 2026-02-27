alter table public.task_checklists
  add column if not exists assigned_to text;
