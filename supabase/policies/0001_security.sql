-- Supabase RLS politikos lovų valdymo sistemai.
-- Šis skriptas įjungia RLS ir sukuria bazines prieigos taisykles.

alter table if exists public.beds enable row level security;
alter table if exists public.bed_status_events enable row level security;
alter table if exists public.ed_board enable row level security;
alter table if exists public.user_interactions enable row level security;
alter table if exists public.nfc_tags enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.task_events enable row level security;

-- Išvalome ankstesnes politikų versijas, kad būtų idempotentiška.
drop policy if exists "Allow authenticated select beds" on public.beds;
drop policy if exists "Allow authenticated select nfc_tags" on public.nfc_tags;
drop policy if exists "Allow authenticated insert bed_status_events" on public.bed_status_events;
drop policy if exists "Allow authenticated select bed_status_events" on public.bed_status_events;
drop policy if exists "Allow authenticated insert ed_board" on public.ed_board;
drop policy if exists "Allow authenticated update ed_board" on public.ed_board;
drop policy if exists "Allow authenticated select ed_board" on public.ed_board;
drop policy if exists "Allow auditor select ed_board" on public.ed_board;
drop policy if exists "Allow authenticated insert user_interactions" on public.user_interactions;
drop policy if exists "Allow auditor select user_interactions" on public.user_interactions;
drop policy if exists "Allow auditor select bed_status_events" on public.bed_status_events;
drop policy if exists "Allow admin manage beds" on public.beds;
drop policy if exists "Allow authenticated select tasks" on public.tasks;
drop policy if exists "Allow admin manage tasks" on public.tasks;
drop policy if exists "Allow authenticated select task_events" on public.task_events;
drop policy if exists "Allow admin manage task_events" on public.task_events;

-- Lovų matomumas visiems autentikuotiems naudotojams.
create policy "Allow authenticated select beds"
on public.beds
for select
to authenticated
using (true);

-- NFC žymų matomumas visiems autentikuotiems naudotojams.
create policy "Allow authenticated select nfc_tags"
on public.nfc_tags
for select
to authenticated
using (true);

-- Leidžiame registruoti lovų būsenas, kai nurodytas prisijungusio naudotojo el. paštas.
create policy "Allow authenticated insert bed_status_events"
on public.bed_status_events
for insert
to authenticated
with check (auth.email() = reported_by);

create policy "Allow authenticated select bed_status_events"
on public.bed_status_events
for select
to authenticated
using (true);

-- ed_board lentelės politika (duomenis pildo Apps Script, bet naudotojai gali matyti ir koreguoti prireikus).
create policy "Allow authenticated insert ed_board"
on public.ed_board
for insert
to authenticated
with check (true);

create policy "Allow authenticated update ed_board"
on public.ed_board
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated select ed_board"
on public.ed_board
for select
to authenticated
using (true);

-- Naudotojų sąveikų žurnalas: leidžiame įrašyti tik savo vardu.
create policy "Allow authenticated insert user_interactions"
on public.user_interactions
for insert
to authenticated
with check (auth.email() = performed_by);

-- Auditoriai (ar administracija) gali peržiūrėti visus žurnalo įrašus.
create policy "Allow auditor select user_interactions"
on public.user_interactions
for select
to authenticated
using (
  auth.role() = 'authenticated'
  and (auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin')
);

create policy "Allow auditor select bed_status_events"
on public.bed_status_events
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));

create policy "Allow auditor select ed_board"
on public.ed_board
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));

-- Administravimas: tik admin gali kurti/keisti lovas.
create policy "Allow admin manage beds"
on public.beds
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'));

create policy "Allow authenticated select tasks"
on public.tasks
for select
to authenticated
using (true);

create policy "Allow admin manage tasks"
on public.tasks
for all
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'));

create policy "Allow authenticated select task_events"
on public.task_events
for select
to authenticated
using (true);

create policy "Allow admin manage task_events"
on public.task_events
for all
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'));

-- Vaizdų prieiga.
grant select on public.aggregated_bed_state to authenticated;
