-- 0006_admin_tasks.sql
-- Lentelės užduočių administravimui ir jų įvykiams.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  zone text,
  zone_label text,
  priority smallint not null default 3,
  due_at timestamptz,
  status text not null default 'planned',
  recurrence text not null default 'none',
  recurrence_label text,
  metadata jsonb default '{}'::jsonb,
  responsible text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_timestamp_tasks'
  ) then
    create trigger set_timestamp_tasks
    before update on public.tasks
    for each row
    execute procedure public.set_current_timestamp_updated_at();
  end if;
end $$;

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  change_type text not null,
  status text,
  priority smallint,
  due_at timestamptz,
  recurrence text,
  metadata jsonb default '{}'::jsonb,
  notes text,
  changed_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists task_events_task_id_idx on public.task_events (task_id, created_at desc);

grant select on public.tasks to authenticated;
grant select on public.task_events to authenticated;
