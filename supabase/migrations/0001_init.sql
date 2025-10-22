-- Supabase migracija: lovų valdymo schema.
-- Šis scenarijus gali būti paleistas pakartotinai.

create extension if not exists "pgcrypto";

create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  nfc_code text unique,
  zone text,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_beds
before update on public.beds
for each row
execute procedure public.set_current_timestamp_updated_at();

create table if not exists public.bed_status_events (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid not null references public.beds(id) on delete cascade,
  status text not null,
  priority smallint default 0,
  notes text,
  reported_by text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bed_status_events_bed_id_idx
  on public.bed_status_events (bed_id, created_at desc);

create table if not exists public.occupancy_events (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid not null references public.beds(id) on delete cascade,
  occupancy_state text not null,
  patient_code text,
  expected_until timestamptz,
  notes text,
  created_by text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists occupancy_events_bed_id_idx
  on public.occupancy_events (bed_id, created_at desc);

create table if not exists public.user_interactions (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  bed_id uuid,
  payload jsonb default '{}'::jsonb,
  performed_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid references public.beds(id) on delete cascade,
  tag_uid text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create view if not exists public.aggregated_bed_state as
  with latest_status as (
    select distinct on (bed_id)
      bed_id,
      status,
      priority,
      notes,
      reported_by,
      metadata,
      created_at
    from public.bed_status_events
    order by bed_id, created_at desc
  ),
  latest_occupancy as (
    select distinct on (bed_id)
      bed_id,
      occupancy_state,
      patient_code,
      expected_until,
      notes,
      created_by,
      metadata,
      created_at
    from public.occupancy_events
    order by bed_id, created_at desc
  )
  select
    b.id as bed_id,
    b.label,
    b.zone,
    b.details,
    ls.status,
    ls.priority,
    ls.notes as status_notes,
    ls.reported_by as status_reported_by,
    ls.metadata as status_metadata,
    ls.created_at as status_created_at,
    lo.occupancy_state,
    lo.patient_code,
    lo.expected_until,
    lo.notes as occupancy_notes,
    lo.created_by as occupancy_created_by,
    lo.metadata as occupancy_metadata,
    lo.created_at as occupancy_created_at
  from public.beds b
  left join latest_status ls on ls.bed_id = b.id
  left join latest_occupancy lo on lo.bed_id = b.id;

grant select on public.beds to authenticated;
grant select on public.aggregated_bed_state to authenticated;
