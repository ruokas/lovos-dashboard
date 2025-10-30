# Supabase migracijos planas

Šis planas parodo, kaip palaipsniui pereiti nuo Google Forms/Sheets prie Supabase. Kiekvienas žingsnis aprašo, kam jis skirtas, ką reikia padaryti Supabase aplinkoje ir kokius projekto failus pataisyti. Tekstas parašytas taip, kad būtų aišku ir medicinos skyriaus darbuotojui be programavimo patirties.

## Kaip naudotis šiuo dokumentu
- Kiekvienas skyrius turi **Tikslą**, kad aiškiai žinotumėte, kodėl tas darbas atliekamas.
- Po to rasite, ką daryti Supabase valdymo pultuose (jei reikia) ir kokius projekto failus atnaujinti.
- Galiausiai pateikiamas "Greitas patikrinimas" – trumpa užduotis, ar viskas veikia.
- Nauji failai pažymėti *(naujas)*, perkelti ar archyvuoti – *(archyvuoti)*.

## Žingsnių apžvalga su failais
1. **Supabase duomenų bazės pamatai.**
   - `supabase/migrations/0001_init.sql` *(naujas)* – SQL scenarijus lentelėms, indeksams ir vaizdui (`view`).
   - `supabase/seeds/bed_layout.csv` *(naujas)* – pradiniai lovų sąrašai su NFC kodais.
   - `README.md` – instrukcijos, kaip paleisti migraciją ir įkelti CSV.
2. **Saugus prisijungimas ir teisių taisyklės.**
   - `supabase/policies/0001_security.sql` *(naujas)* – Row Level Security (RLS) politikos.
   - `supabase/policies/README.md` *(naujas)* – trumpas paaiškinimas apie roles.
   - `supabase/edge-functions/report-export/index.ts` *(naujas)* ir `package.json` *(naujas)* – būsimos ataskaitų funkcijos karkasas.
3. **Perjungimas į modulinį front-end.**
   - `index.html`, `app.js` – pereiname prie modulio ir Supabase konfigūracijos.
   - `working-app-fixed.js` *(archyvuoti į `docs/archive/`)* – seną failą perkeliame.
   - `docs/archive/README.md` *(naujas)*, `README.md` – paaiškiname, kodėl archyvuota, atnaujiname diegimą.
4. **Supabase kliento modulis.**
   - `package.json` – pridedame `@supabase/supabase-js` ir CLI komandas.
   - `persistence/supabaseClient.js` *(naujas)* – vienas Supabase kliento egzempliorius.
   - `config/supabaseConfig.js` *(naujas)* – raktų ir URL nuskaitymas.
   - `tests/supabaseClient.test.js` *(naujas)* – patikrina, ar konfigūracija pilna.
5. **Duomenų išsaugojimas per Supabase.**
   - `persistence/dataPersistenceManager.js` – visos operacijos tampa asinchroninės.
   - `persistence/syncMetadataService.js` *(naujas)* – kada paskutinį kartą sinchronizuota.
   - `utils/time.js` – serverio laiko konvertavimas.
   - `tests/dataPersistenceManager.test.js` – pridėti Supabase "mock" testams.
6. **Formos ir NFC veiksmai.**
   - `forms/bedStatusForm.js`, `app.js` – formų pateikimas per Supabase.
   - `nfc/nfcHandler.js` *(naujas)* – NFC URL ar skaitytuvo apdorojimas.
   - `analytics/userInteractionLogger.js` *(naujas)* – veiksmo žurnalas.
   - `texts.js` – LT/EN žinutės klaidoms ir sėkmei.
7. **Realaus laiko atnaujinimai ir pranešimai.**
   - `models/bedDataManager.js`, `notifications/notificationManager.js`, `app.js` – prenumerata Supabase kanalams.
   - `tests/realtimeFlows.test.js` *(naujas)* – patikrinti, ar reakcija į įvykius veikia.
8. **Auditas ir ataskaitos.**
   - `reports/reportingService.js` *(naujas)*, `app.js` – KPI ir auditų rodymas.
   - `docs/REPORTS.md` *(naujas)* – paaiškinimai, kokie KPI renkami.
   - `supabase/edge-functions/report-export/index.ts` – užpildyti eksportavimo logiką.
   - `tests/reportingService.test.js` – testai tuščioms/nesėkmingoms užklausoms.

---

## 1. Supabase schemos sukūrimas lovų valdymui
**Tikslas.** Turėti tvarkingą duomenų bazę, kurioje aiškiai aprašytos lovos, jų statusai, užimtumas, NFC žymos ir naudotojų veiksmai.

> 📌 **Pastaba (2024-03).** Lovų užimtumo duomenys dabar ateina iš „Google Apps Script“ į lentelę `ed_board`. Ankstesnė lentelė `occupancy_events` liko tik istorijoje ir pašalinama migracijos failu `0005_use_ed_board.sql`. Jei diegiate nuo nulio, paleiskite visas migracijas iš eilės – `0005` automatiškai sukurs `ed_board` ir atnaujins vaizdus.

**Kas daroma Supabase.**
- Supabase SQL editoriuje paleiskite migracijos scenarijų (žemiau), kuris sukuria lenteles `beds`, `bed_status_events`, `occupancy_events`, `user_interactions`, `nfc_tags`, pagalbines funkcijas ir vaizdą `aggregated_bed_state`.
- Įkelkite `BED_LAYOUT` informaciją į `beds` lentelę (galima naudoti `insert` ar CSV importą).
- Jeigu turite senų įrašų iš Google Sheets, juos eksportuokite į CSV ir naudokite `copy` arba `supabase import`, kad užpildytumėte istoriją.

```sql
-- 1 žingsnio migracija: lentelės, indeksai ir vaizdai.
-- Naudoja pgcrypto -> gen_random_uuid, todėl įjungiame praplėtimą.
create extension if not exists "pgcrypto";

-- Pagalbinė funkcija automatiškai atnaujinti updated_at lauką.
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Lentelė lovoms.
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

-- Lentelė statuso įvykiams.
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

-- Lentelė užimtumo įvykiams.
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

-- Lentelė NFC žymoms (galima naudoti keliems įrenginiams).
create table if not exists public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  bed_id uuid references public.beds(id) on delete set null,
  tag_code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- Lentelė naudotojų sąveikų žurnalui.
create table if not exists public.user_interactions (
  id uuid primary key default gen_random_uuid(),
  interaction_type text not null,
  bed_id uuid references public.beds(id) on delete set null,
  tag_code text,
  performed_by text,
  payload jsonb default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists user_interactions_type_idx
  on public.user_interactions (interaction_type, occurred_at desc);

-- Vaizdas, kuris sujungia naujausią statusą ir užimtumą.
create or replace view public.aggregated_bed_state as
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

-- Pasirinktinai: materializuotas vaizdas galima sukurti vėliau (žr. 8 žingsnį).
```

**Kokius projekto failus keisime.**
- `supabase/migrations/0001_init.sql` *(naujas)* – sutalpinkite visus SQL sakinius (lentelės, indeksai, `view`). Įrašykite komentarus, ką reiškia kiekvienas stulpelis.
- `supabase/seeds/bed_layout.csv` *(naujas)* – įrašykite stulpelius `label`, `nfc_code`, `zone`, kad galėtumėte patogiai importuoti lovų sąrašą.
- `README.md` – pridėkite instrukciją, kaip paleisti `supabase db push` ir kaip įkelti CSV failą per CLI arba naršyklę.

**Greitas patikrinimas.** Supabase SQL editoriuje paleiskite `select * from aggregated_bed_state limit 5;`. Turėtumėte matyti realias lovas ir jų paskutinę būseną.

## 2. Supabase autentikacijos ir RLS konfigūracija
**Tikslas.** Užtikrinti, kad prie duomenų gali jungtis tik autorizuoti darbuotojai, o veiksmai būtų fiksuojami saugiai.

**Kas daroma Supabase.**
- Supabase Authentication dalyje įjunkite prisijungimą el. paštu arba "magic link".
- Sukurkite roles (pvz., `cleaning_staff`, `auditor`) per naudotojo metaduomenis.
- Įjunkite Row Level Security (RLS) visose lentelėse ir parašykite taisykles, leidžiančias matyti/kurti įrašus tik prisijungusiems.
- Paruoškite Edge Function (veiks serverio pusėje), kuri su `service_role` raktu pateiks ataskaitas.

```sql
-- 2 žingsnio saugumo politikos. Pirma įjungiame RLS ir sukuriame pagrindines roles.
alter table if exists public.beds enable row level security;
alter table if exists public.bed_status_events enable row level security;
alter table if exists public.occupancy_events enable row level security;
alter table if exists public.user_interactions enable row level security;
alter table if exists public.nfc_tags enable row level security;

-- Role tik patikrinimui (pasirinktinai). Supabase Auth naudotojams priskirkite role per metaduomenis.
-- create role cleaning_staff noinherit;  -- paleiskite tik jei norite valdyti Postgres role.

-- Bendras leidimas autentikuotiems vartotojams matyti lovas.
create policy "Allow authenticated select beds"
on public.beds
for select
to authenticated
using (true);

-- Tik autentikuotiems leisti matyti NFC žymas.
create policy "Allow authenticated select nfc_tags"
on public.nfc_tags
for select
to authenticated
using (true);

-- Tik autentikuotiems leisti kurti naujus lovų statusus, jei jie nurodo savo el. paštą.
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

-- Užimtumo įvykių politika.
create policy "Allow authenticated insert occupancy_events"
on public.occupancy_events
for insert
to authenticated
with check (auth.email() = created_by);

create policy "Allow authenticated select occupancy_events"
on public.occupancy_events
for select
to authenticated
using (true);

-- Naudotojų sąveikų žurnalas.
create policy "Allow authenticated insert user_interactions"
on public.user_interactions
for insert
to authenticated
with check (auth.email() = performed_by);

create policy "Allow auditor select user_interactions"
on public.user_interactions
for select
to authenticated
using (
  auth.role() = 'authenticated'
  and (auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin')
);

-- Kad auditorių rolė matytų visus įrašus.
create policy "Allow auditor select bed_status_events"
on public.bed_status_events
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));

create policy "Allow auditor select occupancy_events"
on public.occupancy_events
for select
to authenticated
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('auditor', 'admin'));

-- Pavyzdys, kaip apriboti lovų redagavimą tik administratoriui.
create policy "Allow admin manage beds"
on public.beds
using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'))
with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin'));

-- Suteikiame atskaitoms galimybę nuskaityti vaizdą.
grant select on public.aggregated_bed_state to authenticated;
```

**Kokius projekto failus keisime.**
- `supabase/policies/0001_security.sql` *(naujas)* – sudėkite `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ir konkrečias `CREATE POLICY` taisykles.
- `supabase/policies/README.md` *(naujas)* – trumpai aprašykite roles, kaip paleisti politikų skriptą ir kaip testuoti, ar veikia.
- `supabase/edge-functions/report-export/index.ts` *(naujas)* – sukurkite TypeScript karkasą (be verslo logikos), kuriame numatyta prisijungti su `service_role` ir tikrinti JWT.
- `supabase/edge-functions/report-export/package.json` *(naujas)* – pridėkite `@supabase/supabase-js` ir paprastus `npm run deploy` skriptus.

**Greitas patikrinimas.** Prisijungęs naudotojas per `curl` ar PostgREST turėtų sugebėti įrašyti naują lovos statusą, o neprisijungęs – gauti 401 klaidą.

## 3. Perjungimas į modulinį front-end be Google Sheets
**Tikslas.** Pašalinti priklausomybę nuo Google Sheets skriptų ir naudoti `app.js` kaip pagrindinį modulį.

**Kas daroma Supabase.** Čia veiksmų Supabase pusėje nėra.

**Kokius projekto failus keisime.**
- `index.html` – vietoje `<script src="working-app-fixed.js">` įdėkite `<script type="module" src="./app.js">`, pašalinkite Papaparse/CDN nuorodas ir pridėkite `data-supabase-url` bei `data-supabase-key` atributus konfigūracijai.
- `app.js` – užtikrinkite, kad pradinė inicializacija perskaitytų Supabase konfigūraciją ir nebesiremtų Google Sheets.
- `working-app-fixed.js` *(archyvuoti)* – perkelkite failą į `docs/archive/working-app-fixed.js`, pridėkite komentarą, kodėl archyvuota versija.
- `docs/archive/README.md` *(naujas)* – trumpai aprašykite, kada naudoti archyvuotus failus.
- `README.md` – atnaujinkite diegimo žingsnius, kad jie rodytų į Supabase.

**Greitas patikrinimas.** Atidarykite programą naršyklėje ir patikrinkite konsolę – neturi būti klaidų apie trūkstamus skriptus.

## 4. Supabase kliento modulio įdiegimas
**Tikslas.** Turėti vieną vietą, kurioje kuriamas Supabase klientas, kad nereikėtų dubliuoti kodo.

**Kas daroma Supabase.** Papildomų veiksmų nereikia.

**Kokius projekto failus keisime.**
- `package.json` – pridėkite `@supabase/supabase-js` priklausomybę ir CLI komandas (`supabase db push`, `supabase functions deploy`).
- `persistence/supabaseClient.js` *(naujas)* – sukurkite modulį, kuris sukuria klientą (`createClient`) ir eksportuoja jį naudoti visoje aplikacijoje.
- `config/supabaseConfig.js` *(naujas)* – funkcija, kuri paima URL ir anon raktą iš `data-*` atributų arba aplinkos kintamųjų; įtraukite LT perspėjimą, kad raktų negalima viešai platinti.
- `tests/supabaseClient.test.js` *(naujas)* – automatizuotas testas, kuris įsitikina, kad be URL ar raktų funkcija grąžina aiškią klaidą.

**Greitas patikrinimas.** Paleiskite naršyklės konsolėje `await supabaseClient.from('beds').select('label').limit(1)` ir įsitikinkite, kad gaunate duomenis be klaidų.

## 5. DataPersistenceManager perkėlimas į Supabase
**Tikslas.** Vietoje `localStorage` naudoti realią duomenų bazę, kad informacija nesikartotų ir būtų prieinama visiems darbuotojams.

**Kas daroma Supabase.** Užtikrinkite, kad lentelės iš 1 žingsnio jau sukurtos ir veikia.

**Kokius projekto failus keisime.**
- `persistence/dataPersistenceManager.js` – pakeiskite visus metodus (`saveFormResponse`, `loadFormResponses`, ir t. t.) į asinchroninius, kurie naudoja `supabaseClient.from(...).insert/select`.
- `persistence/syncMetadataService.js` *(naujas)* – funkcija, kuri paima paskutinio atnaujinimo laiką (`MAX(updated_at)` iš `aggregated_bed_state` arba naujos `sync_metadata` lentelės).
- `utils/time.js` – pridėkite pagalbinius metodus, kaip Supabase laikus (UTC) rodyti vietiniu laiku.
- `tests/dataPersistenceManager.test.js` – naudokite Supabase kliento "mock" objektus, kad patikrintumėte sėkmės ir klaidų scenarijus.

**Greitas patikrinimas.** Užpildykite lovos būklės formą ir įsitikinkite, kad naujas įrašas atsiranda Supabase lentelėje, o suvestinė duomenų atnaujėja.

## 6. Formų ir NFC logikos atnaujinimas
**Tikslas.** NFC žyma ar URL turi automatiškai atidaryti teisingą lovos formą, o kiekvienas paspaudimas būtų užfiksuotas.

**Kas daroma Supabase.** Paruoškite `nfc_tags` lentelę (iš 1 žingsnio) su lovų ir NFC kodų ryšiu.

**Kokius projekto failus keisime.**
- `forms/bedStatusForm.js` – perrašykite `handleSubmit`, kad lauktų Supabase atsakymo ir rodytų aiškias LT klaidų/sėkmės žinutes.
- `app.js` – pridėkite `initNfcFlow`, kuris iškviečia NFC tvarkyklę ir perduoda Supabase klientą.
- `nfc/nfcHandler.js` *(naujas)* – parašykite logiką, kuri perskaito NFC arba URL parametrą `?tag=`, randa lovos ID ir atidaro formą.
- `analytics/userInteractionLogger.js` *(naujas)* – centralizuotas `logInteraction` metodas, kuris įrašo veiksmus į `user_interactions` lentelę.
- `texts.js` – papildykite LT ir būsimas EN frazes, kurios rodomos vartotojui (pvz., "NFC žyma neatpažinta", "Duomenys išsaugoti").

**Greitas patikrinimas.** Nuskenuokite NFC žymą arba atidarykite URL su `?tag=` parametru. Formoje pasirinkta lova turi užsipildyti automatiškai, įrašas Supabase atsiranda tiek statusų lentelėje, tiek `user_interactions`.

## 7. Realaus laiko atnaujinimai ir pranešimai
**Tikslas.** Kai viena komanda pakeičia lovos statusą, kiti tai matytų iš karto be puslapio perkrovimo.

**Kas daroma Supabase.** Įjunkite Realtime kanalus `bed_status_events` ir `occupancy_events` lentelėms (Supabase skiltyje "Database" → "Replication"/"Realtime"). Jei norite tai padaryti SQL redaktoriumi, naudokite šią komandą:

```sql
-- 7 žingsnis: įtraukiame lenteles į Realtime publikaciją.
alter publication supabase_realtime add table public.bed_status_events;
alter publication supabase_realtime add table public.occupancy_events;
```

**Kokius projekto failus keisime.**
- `models/bedDataManager.js` – pradinį duomenų gavimą darykite per `select` iš `aggregated_bed_state`, o naujus įvykius priimkite per Realtime kanalą.
- `notifications/notificationManager.js` – `updateNotifications` turi dirbti su Supabase `payload.new` ir naudoti serverio laiką.
- `app.js` – įdiekite `subscribeToRealtime` funkciją su klaidų valdymu ir atsijungimo scenarijais.
- `tests/realtimeFlows.test.js` *(naujas)* – sukurkite testus, kurie imitavo Supabase kanalą ir patikrino, ar modeliai bei pranešimai reaguoja.

**Greitas patikrinimas.** Atidarykite programą dviejuose naršyklės languose. Pakeitus lovos būseną viename lange, per <2 s pranešimas turi atsirasti kitame.

## 8. Audito ir ataskaitų sluoksnio diegimas
**Tikslas.** Turėti aiškias ataskaitas apie lovų tvarkymą, darbuotojų aktyvumą ir SLA rodiklius.

**Kas daroma Supabase.**
- Supabase SQL redaktoriuje sukurkite `materialized view` (žemiau pateiktas pavyzdys `daily_bed_metrics`) su dienos KPI. 
  Naudokite suplanuotą agregavimą per dieną ir `LATERAL` užklausą, kad kiekvienam statuso įvykiui būtų priskirtas artimiausias tos pačios dienos užimtumo įvykis. Taip išvengsite kartesinio sandaugos, kuri atsirastų jungiant lenteles vien pagal `bed_id`.
- Numatytoje Edge Function (`report-export`) užtikrinkite, kad ji gali generuoti CSV/JSON su KPI.

```sql
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
  coalesce(doc.occupancy_updates, 0) as occupancy_updates,
  ds.avg_minutes_between_status_and_occupancy,
  coalesce(ds.sla_breaches, 0) as sla_breaches
from all_days d
left join daily_status ds on ds.day = d.day
left join daily_occupancy doc on doc.day = d.day
order by d.day desc;

create unique index if not exists daily_bed_metrics_day_idx
  on public.daily_bed_metrics (day);

-- Atšviežinti, kai įkeliami nauji duomenys.
refresh materialized view public.daily_bed_metrics;

grant select on public.daily_bed_metrics to authenticated;
```

> Pastaba: nenaudokite `do` kaip aliaso (PostgreSQL rezervuotas žodis). Todėl šiame žingsnyje naudojame `doc`, kad Supabase SQL redaktorius nebegeneruotų sintaksės klaidos.

**Kokius projekto failus keisime.**
- `reports/reportingService.js` *(naujas)* – metodai `fetchDailyMetrics`, `fetchInteractionAudit`, su klaidų valdymu ir pranešimais vartotojui.
- `app.js` – integruokite ataskaitų modulį į pradinį įkrovimą ir KPI kortelių atnaujinimą.
- `docs/REPORTS.md` *(naujas)* – paaiškinkite KPI reikšmes, iš kur jos gaunamos, kaip naudotis eksportu.
- `supabase/edge-functions/report-export/index.ts` – užbaikite logiką (CSV/JSON generavimas, leidimai).
- `tests/reportingService.test.js` – pridėkite testus, kurie tikrina tuščius atsakymus, klaidas ir sėkmingą duomenų gavimą.

**Greitas patikrinimas.** Įrašę kelis testinius įvykius, atnaujinkite dashboardą ir patikrinkite, ar KPI kortelės rodo Supabase apskaičiuotus rodiklius.

---

## Baigiamoji pastaba
Visus žingsnius galima įgyvendinti po vieną. Po kiekvieno etapo verta dokumentuoti pastebėjimus ir, jei kyla klausimų, pažymėti juos šiame faile, kad komanda aiškiai žinotų progresą.
