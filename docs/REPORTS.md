# Ataskaitos ir auditas

Šis dokumentas apibūdina, kaip dashboarde rodomi pagrindiniai KPI rodikliai, kokie duomenys naudojami audito žurnalui ir kaip eksportuoti ataskaitas iš Supabase aplinkos.

## KPI suvestinė

Dashboardo KPI kortelės dabar naudoja `Supabase` agreguotus duomenis:

- **Sutvarkytos lovos.** Skaičius iš `public.aggregated_bed_state`, rodo kiek lovų turi būseną „✅ Viskas tvarkinga“. Kortelėje papildomai matomas bendras lovų kiekis.
- **Reikia dėmesio.** Sumuoja lovas, kurioms priskirtos problemos („🛏️ Netvarkinga lova“, „🧰 Trūksta priemonių“, „Other“). Rodomas ir aktyvių pranešimų skaičius pagal paskutinį įrašą Supabase.
- **Užimtos lovos.** Grįsta laukeliu `occupancy_state` (`occupied`/`free`). Papildoma eilutė nurodo laisvų lovų skaičių.
- **SLA pažeidimai (24h).** Naudojama materializuota peržiūra `public.daily_bed_metrics`. Kortelė rodo paskutinių 24 val. SLA pažeidimų skaičių ir vidutinį laiką (minutėmis) tarp būsenos pakeitimo ir artimiausio užimtumo įrašo.

Jeigu Supabase nepasiekiamas, kortelės persijungia į vietinę logiką (skaičiuojama iš `BedDataManager`), o viršuje pateikiamas perspėjimas.

## Audito žurnalas

Skiltyje „Veiksmų žurnalas“ rodomi paskutiniai 10 įrašų iš lentelės `user_interactions`. Kiekvienai eilutei rodoma:

- veiksmų tipas (`interaction_type`),
- lovos identifikatorius (iš `payload.bedLabel`, `payload.bedId` arba `bed_id`),
- naudotojas, kuris atliko veiksmą (`performed_by`),
- laiko žyma (`occurred_at`).

Jeigu prisijungęs naudotojas neturi teisių arba Supabase ryšys nutrūkęs, vietoje žurnalo pateikiamas informacinis pranešimas.

## Ataskaitų eksportas

Audito kortelėje yra du mygtukai:

- **JSON eksportas.** Naudoja Supabase Edge funkciją `report-export` ir atsisiunčia JSON failą su kasdieniais KPI (`daily_bed_metrics`) ir paskutiniais žurnalo įrašais.
- **CSV eksportas.** Naudoja tą pačią funkciją, bet konvertuoja `daily_bed_metrics` į CSV formatą (UTF-8).

### Edge funkcijos kvietimas rankiniu būdu

```
curl -X GET \
  "https://<YOUR-PROJECT>.supabase.co/functions/v1/report-export?format=json" \
  -H "Authorization: Bearer <USER_JWT>"
```

Galite pakeisti `format=csv`, jeigu reikia CSV. Funkcija tikrina naudotojo rolę (`auditor` arba `admin`). Jei rolė neatitinka – grąžinamas HTTP 403.

## Greitas patikrinimas

1. Supabase SQL redaktoriuje paleiskite migraciją `supabase/migrations/0002_daily_metrics.sql` ir įsitikinkite, kad `daily_bed_metrics` atnaujintas (`refresh materialized view`).
2. Prisijunkite prie dashboardo su naudotoju, turinčiu rolę `auditor`.
3. Atlikite bent po vieną lovos būsenos ir užimtumo įrašą.
4. Patikrinkite, ar KPI kortelės atsinaujina, o „Veiksmų žurnalas“ rodo atliktus veiksmus.
5. Paspauskite „JSON eksportas“ – turi atsisiųsti failas su KPI ir audito duomenimis.
