# Vartotojų rolių priskyrimas Supabase

Šis gidas paaiškina, kaip priskirti arba keisti naudotojų roles (`cleaning_staff`, `auditor`, `admin`) Supabase projekte. Rolės saugomos naudotojo `user_metadata.role` lauke ir naudojamos RLS politikose bei Edge funkcijose.

## Prieš pradedant
- Turėkite administratoriaus prieigą prie Supabase projekto.
- Įsitikinkite, kad jau įjungtos RLS politikos iš `supabase/policies/0001_security.sql`.

## 1. Rolės keitimas Supabase valdymo pulte
1. Prisijunkite prie [Supabase valdymo pulto](https://app.supabase.com/) ir pasirinkite projektą.
2. Eikite į **Authentication → Users**.
3. Pasirinkite naudotoją, kurio rolę norite nustatyti, ir spauskite **Edit user**.
4. Skiltyje **User Metadata** pridėkite (arba atnaujinkite) JSON objektą:
   ```json
   {
     "role": "cleaning_staff"
   }
   ```
   Galimos reikšmės:
   - `cleaning_staff` – gali registruoti lovų tvarkymo įrašus.
   - `auditor` – gali skaityti auditą ir KPI suvestines.
   - `admin` – pilna prieiga prie lovų sąrašo ir konfigūracijos.
5. Išsaugokite pakeitimus. Naudotojas turi iš naujo prisijungti, kad gautų naują JWT su atnaujinta role.

> Patarimas. Jei reikia kelių atributų (pvz., `shift`), laikykite juos tame pačiame `user_metadata` objekte.

## 2. Rolės priskyrimas SQL užklausa
Galite greitai atnaujinti role SQL redaktoriuje ar `psql`:
```sql
update auth.users
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{role}', '"auditor"'::jsonb)
where email = 'vardas.pavarde@ligonine.lt';
```

> Saugumas. SQL užklausa paveiks tik pasirinktą naudotoją pagal el. paštą. Prieš vykdydami, įsitikinkite, kad rolių reikšmė viena iš palaikomų.

## 3. Rolės nustatymas per Supabase CLI
Jeigu tvarkote naudotojus automatizuotai, naudokite CLI:
```bash
supabase auth update user --email vardas.pavarde@ligonine.lt --data '{"role":"admin"}'
```

Papildomi parametrai:
- `--no-password` – nekeičia slaptažodžio.
- `--phone` – jei naudojate SMS prisijungimą.

## 4. Testavimo kontrolinis sąrašas
Po kiekvieno rolių keitimo atlikite greitą patikrą:
- Prisijunkite su atnaujintu naudotoju ir paleiskite pagrindinę funkciją (pvz., `cleaning_staff` turėtų galėti pažymėti lovą kaip „Išvalyta“).
- Naudotojas be `auditor`/`admin` rolės neturėtų matyti audito žurnalo.
- Administratorius turi galėti redaguoti `beds` lentelės įrašus be klaidų.

## 5. Dažniausios klaidos
- **JWT neatsinaujino.** Paprašykite naudotojo atsijungti ir prisijungti iš naujo.
- **Rolė neteisinga.** Patikrinkite JSON sintaksę (`{"role":"auditor"}` be papildomų kablelių ar kabučių).
- **Politikos vis tiek atmeta.** Įsitikinkite, kad migracijos ir RLS politikos įdiegtos pagal `README.md` instrukcijas.

## 6. Tolimesni žingsniai
- Jei reikia daugiau rolių (pvz., `nurse_manager`), papildykite RLS politikų failus ir Edge funkcijų vaidmenų sąrašus.
- Naudokite `auth.admin.listUsers()` per Supabase Admin API, kad automatizuotai auditavote rolių paskirstymą.
