# RLS politikų diegimas

Šiame kataloge laikomos visos Row Level Security (RLS) taisyklės lovų valdymo sistemai. Politikos pritaikomos per Supabase CLI,
o jų tikslas – užtikrinti, kad tik prisijungę darbuotojai galėtų matyti ir kurti įrašus.

## Rolės
- **authenticated** – visi prisijungę naudotojai, kurie gali matyti lovas, NFC žymas ir registruoti veiksmus.
- **cleaning_staff** – tvarkymo personalo vartotojai (metaduomenyse naudokite `{"role": "cleaning_staff"}`), kurie realiai vykdo lovų
  priežiūrą. Politikos leidžia jiems rašyti tik savo vardu.
- **auditor** – kokybės kontrolės ar vadovybės nariai. Gali skaityti žurnalus (`user_interactions`) ir visą istoriją.
- **admin** – sistemos administratoriai. Gali keisti lovų sąrašą (`beds`) ir matyti visus duomenis.

> Pastaba. Rolės Supabase pusėje dažniausiai saugomos naudotojo `user_metadata.role` lauke. Patalpų personalui pakanka `cleaning_staff`,
o auditorių naudotojams priskirkite `auditor`.

## Diegimo žingsniai
1. Įsitikinkite, kad CLI prijungtas prie tinkamo projekto (`supabase link`).
2. Paleiskite politikų skriptą:
   ```bash
   supabase db push --file supabase/policies/0001_security.sql
   ```
3. Jei naudojatės naršyklės SQL redaktoriumi, nukopijuokite visą failo turinį ir paleiskite vienu kartu.

## Testavimo scenarijai
1. **Autentikuotas įrašas.** Prisijunkite kaip naudotojas su `cleaning_staff` role ir per `curl` (ar PostgREST) bandykite įterpti
   `bed_status_events` įrašą, nurodydami savo el. paštą – užklausa turi būti sėkminga (`201 Created`).
2. **Neautentikuota užklausa.** Pašalinkite `Authorization` antraštę ir bandykite įterpti tą patį įrašą – turite gauti `401 Unauthorized`.
3. **Auditoriaus skaitymas.** Prisijunkite su naudotoju, kurio `user_metadata.role = "auditor"`, ir vykdykite `select` į `user_interactions`
   – atsakymas turi būti `200 OK`.
4. **Administratoriaus redagavimas.** Prisijunkite su administratoriaus naudotoju ir patikrinkite, kad `insert` į `beds` veiktų, o be admin
   rolės užklausa būtų atmesta (`403` arba `42501`).

## Greitas patikrinimas (CLI)
```bash
supabase db push --file supabase/policies/0001_security.sql
supabase db remote commit
```
Jei komanda įvykdoma be klaidų, politikos įdiegtos teisingai.
