-- 0005_use_ed_board.sql
-- Pereinama nuo occupancy_events lentelės prie ed_board lentelės, kuri pildoma per Apps Script.

-- Pirma pašaliname priklausomus vaizdus, kad galėtume keisti lenteles.
drop materialized view if exists public.daily_bed_metrics;
drop view if exists public.aggregated_bed_state;

drop table if exists public.occupancy_events cascade;

create table if not exists public.ed_board (
  vieta text primary key,
  slaugytojas text,
  padejejas text,
  gydytojas text,
  kat numeric,
  pacientas text,
  busena text,
  komentaras text,
  updated_at timestamptz default timezone('utc', now())
);

create unique index if not exists ed_board_vieta_idx on public.ed_board (vieta);

grant select, insert, update on public.ed_board to authenticated;

drop view if exists public.ed_board_events;
create view public.ed_board_events as
  select
    e.vieta,
    b.id as bed_id,
    e.busena,
    e.pacientas,
    e.komentaras,
    e.slaugytojas,
    e.padejejas,
    e.gydytojas,
    e.kat,
    e.updated_at
  from public.ed_board e
  left join public.beds b on b.label = e.vieta;

create view public.aggregated_bed_state as
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
  latest_board as (
    select distinct on (e.vieta)
      e.vieta,
      e.busena,
      e.pacientas,
      e.komentaras,
      e.slaugytojas,
      e.padejejas,
      e.gydytojas,
      e.kat,
      e.updated_at,
      b.id as bed_id
    from public.ed_board e
    left join public.beds b on b.label = e.vieta
    order by e.vieta, e.updated_at desc nulls last
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
    lb.busena as occupancy_state,
    lb.pacientas as patient_code,
    null::timestamptz as expected_until,
    lb.komentaras as occupancy_notes,
    coalesce(lb.slaugytojas, lb.padejejas, lb.gydytojas) as occupancy_created_by,
    jsonb_strip_nulls(jsonb_build_object(
      'nurse', lb.slaugytojas,
      'assistant', lb.padejejas,
      'doctor', lb.gydytojas,
      'kat', lb.kat
    )) as occupancy_metadata,
    lb.updated_at as occupancy_created_at,
    greatest(
      coalesce(ls.created_at, lb.updated_at),
      coalesce(lb.updated_at, ls.created_at)
    ) as updated_at
  from public.beds b
  left join latest_status ls on ls.bed_id = b.id
  left join latest_board lb on lb.vieta = b.label;

create materialized view public.daily_bed_metrics as
with status_events as (
  select
    e.id,
    e.bed_id,
    b.label as bed_label,
    e.priority,
    e.created_at,
    date_trunc('day', e.created_at)::date as day
  from public.bed_status_events e
  left join public.beds b on b.id = e.bed_id
),
board_events as (
  select
    b.id as bed_id,
    e.vieta as bed_label,
    e.updated_at,
    date_trunc('day', e.updated_at)::date as day
  from public.ed_board e
  left join public.beds b on b.label = e.vieta
  where e.updated_at is not null
),
status_with_matches as (
  select
    s.day,
    s.id,
    s.priority,
    s.created_at as status_created_at,
    matched.occupancy_created_at
  from status_events s
  left join lateral (
    select
      o.updated_at as occupancy_created_at
    from board_events o
    where
      (
        (o.bed_id is not null and o.bed_id = s.bed_id)
        or (o.bed_id is null and o.bed_label = s.bed_label)
      )
      and o.updated_at >= s.created_at
      and o.updated_at < s.created_at + interval '1 day'
    order by o.updated_at
    limit 1
  ) matched on true
),
daily_status as (
  select
    day,
    count(*) as status_updates,
    avg(extract(epoch from (occupancy_created_at - status_created_at)) / 60.0)
      filter (where occupancy_created_at is not null) as avg_minutes_between_status_and_occupancy,
    count(*) filter (
      where priority >= 2
        and (
          occupancy_created_at is null
          or occupancy_created_at - status_created_at > interval '30 minutes'
        )
    ) as sla_breaches
  from status_with_matches
  group by day
),
daily_occupancy as (
  select
    day,
    count(*) as occupancy_updates
  from board_events
  group by day
),
all_days as (
  select day from daily_status
  union
  select day from daily_occupancy
)
select
  d.day,
  coalesce(ds.status_updates, 0) as status_updates,
  coalesce(doc.occupancy_updates, 0) as occupancy_updates,
  ds.avg_minutes_between_status_and_occupancy,
  coalesce(ds.sla_breaches, 0) as sla_breaches
from all_days d
left join daily_status ds on ds.day = d.day
left join daily_occupancy doc on doc.day = d.day
order by d.day desc;

create unique index if not exists daily_bed_metrics_day_idx
  on public.daily_bed_metrics (day);

refresh materialized view public.daily_bed_metrics;

grant select on public.aggregated_bed_state to authenticated;
grant select on public.daily_bed_metrics to authenticated;
grant select on public.ed_board_events to authenticated;
