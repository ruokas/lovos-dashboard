-- Adds metadata JSONB columns to event tables if they do not yet exist
-- and refreshes the aggregated_bed_state view so the new fields are exposed.

alter table public.bed_status_events
  add column if not exists metadata jsonb;

alter table public.occupancy_events
  add column if not exists metadata jsonb;

drop view if exists public.aggregated_bed_state;

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

grant select on public.aggregated_bed_state to authenticated;
