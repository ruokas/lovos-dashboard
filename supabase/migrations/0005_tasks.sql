-- Užduočių ir šablonų lentelės lovų valdymo sistemai.
-- Scenarijus idempotentiškas, galima paleisti pakartotinai.

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text,
  priority smallint not null default 0,
  status text not null default 'active',
  due_at timestamptz,
  recurrence jsonb,
  assigned_to text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_timestamp_task_templates on public.task_templates;
create trigger set_timestamp_task_templates
before update on public.task_templates
for each row
execute procedure public.set_current_timestamp_updated_at();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.task_templates(id) on delete set null,
  category text not null,
  description text,
  priority smallint not null default 0,
  status text not null default 'pending',
  due_at timestamptz,
  recurrence jsonb,
  assigned_to text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_timestamp_tasks on public.tasks;
create trigger set_timestamp_tasks
before update on public.tasks
for each row
execute procedure public.set_current_timestamp_updated_at();

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_due_at_idx on public.tasks (due_at);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  status text,
  notes text,
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_id_idx
  on public.task_events (task_id, created_at desc);
create index if not exists task_events_type_idx
  on public.task_events (event_type);

alter table if exists public.task_templates enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.task_events enable row level security;

-- Išvalome ankstesnes politikų versijas.
drop policy if exists "Allow authenticated select task_templates" on public.task_templates;
drop policy if exists "Allow admin manage task_templates" on public.task_templates;
drop policy if exists "Allow authenticated insert tasks" on public.tasks;
drop policy if exists "Allow authenticated update tasks" on public.tasks;
drop policy if exists "Allow authenticated select tasks" on public.tasks;
drop policy if exists "Allow auditor select tasks" on public.tasks;
drop policy if exists "Allow authenticated insert task_events" on public.task_events;
drop policy if exists "Allow authenticated select task_events" on public.task_events;
drop policy if exists "Allow auditor select task_events" on public.task_events;

create policy "Allow authenticated select task_templates"
on public.task_templates
for select
to authenticated
using (true);

create policy "Allow admin manage task_templates"
on public.task_templates
for all
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'));

create policy "Allow authenticated select tasks"
on public.tasks
for select
to authenticated
using (true);

create policy "Allow authenticated insert tasks"
on public.tasks
for insert
to authenticated
with check (
  assigned_to is null
  or assigned_to = auth.email()
);

create policy "Allow authenticated update tasks"
on public.tasks
for update
to authenticated
using (
  assigned_to is null
  or assigned_to = auth.email()
)
with check (
  assigned_to is null
  or assigned_to = auth.email()
);

create policy "Allow auditor select tasks"
on public.tasks
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));

create policy "Allow authenticated select task_events"
on public.task_events
for select
to authenticated
using (true);

create policy "Allow authenticated insert task_events"
on public.task_events
for insert
to authenticated
with check (auth.email() = created_by);

create policy "Allow auditor select task_events"
on public.task_events
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));
