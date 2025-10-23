-- 8 žingsnis: materializuotas vaizdas dienos KPI ir pagalbiniai indeksai.
drop materialized view if exists public.daily_bed_metrics;

create materialized view public.daily_bed_metrics as
with status_events as (
  select
    id,
    bed_id,
    priority,
    created_at,
    date_trunc('day', created_at)::date as day
  from public.bed_status_events
),
occupancy_events as (
  select
    id,
    bed_id,
    created_at,
    date_trunc('day', created_at)::date as day
  from public.occupancy_events
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
      o.created_at as occupancy_created_at
    from occupancy_events o
    where o.bed_id = s.bed_id
      and o.created_at >= s.created_at
      and o.created_at < s.created_at + interval '1 day'
    order by o.created_at
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
  from occupancy_events
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
  coalesce(do.occupancy_updates, 0) as occupancy_updates,
  ds.avg_minutes_between_status_and_occupancy,
  coalesce(ds.sla_breaches, 0) as sla_breaches
from all_days d
left join daily_status ds on ds.day = d.day
left join daily_occupancy do on do.day = d.day
order by d.day desc;

create unique index if not exists daily_bed_metrics_day_idx
  on public.daily_bed_metrics (day);

-- Atšviežinti, kai įkeliami nauji duomenys.
refresh materialized view public.daily_bed_metrics;

grant select on public.daily_bed_metrics to authenticated;
