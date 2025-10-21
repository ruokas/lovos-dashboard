# Lovų valdymo sistema

Pilna lovų švaros valdymo sistema su vietiniais skaičiavimais ir pranešimais.

## Funkcijos

### Pagrindinės funkcijos
- **Lovų būklės valdymas**: Pranešti apie lovų būklę (tvarkinga, netvarkinga, trūksta priemonių, kita problema)
- **Užimtumo sekimas**: Sekti kada lovos tampa laisvos ar užimtos
- **Automatiniai pranešimai**: Prioritetiniai pranešimai pagal problemų svarbą
- **Vietiniai skaičiavimai**: Visi skaičiavimai vykdomi vietoje, nepriklausomai nuo išorinių duomenų šaltinių

### Pranešimų prioritetai
1. **Netvarkinga lova** (aukščiausias prioritetas)
2. **Trūksta priemonių**
3. **Kita problema**
4. **Ką tik atlaisvinta** (reikia sutvarkyti)
5. **Reguliarus patikrinimas** (užimtos lovos)

### Lovų išdėstymas
- IT1, IT2
- 1-17
- 121A, 121B

### Nustatymai
- Patikrinimo intervalai užimtoms lovoms
- "Ką tik atlaisvinta" laikotarpis
- SLA slenkstis
- Automatinio atnaujinimo intervalas
- Garso signalai ir pranešimai

## Naudojimas

### Pranešti apie lovos būklę
1. Spustelėkite "Pranešti apie būklę"
2. Pasirinkite lovą
3. Pasirinkite būseną:
   - ✅ Viskas tvarkinga
   - 🛏️ Netvarkinga lova
   - 🧰 Trūksta priemonių
   - Other: (aprašykite problemą)
4. Įveskite el. paštą
5. Spustelėkite "Pranešti"

### Atnaujinti užimtumą
1. Spustelėkite "Atnaujinti užimtumą"
2. Pasirinkite lovą
3. Pasirinkite būseną (Laisva/Užimta)
4. Spustelėkite "Atnaujinti"

### Greitasis lovos atnaujinimas
- **Kairiuoju pelės mygtuku** ant lovos → Pranešti apie būklę
- **Dešiniuoju pelės mygtuku** ant lovos → Atnaujinti užimtumą

## Technologijos

- **Vanilla JavaScript** (ES6+ modules)
- **Tailwind CSS** (styling)
- **localStorage** (duomenų saugojimas)
- **Web Audio API** (garso signalai)
- **Web Notifications API** (pranešimai)

## Struktūra

```
├── models/
│   └── bedData.js          # Duomenų modeliai ir skaičiavimai
├── settings/
│   └── settingsManager.js  # Nustatymų valdymas
├── forms/
│   └── bedStatusForm.js    # Formų sąsaja
├── notifications/
│   └── notificationManager.js # Pranešimų sistema
├── persistence/
│   └── dataPersistenceManager.js # Duomenų saugojimas
├── supabase/
│   ├── migrations/         # SQL scenarijai (Supabase CLI)
│   └── seeds/              # Pradiniai CSV duomenys
├── app.js                  # Pagrindinis aplikacijos kontroleris
├── index.html              # Pagrindinis HTML failas
└── styles.css              # Papildomi stiliai
```

## Supabase integracijos pradžia

Šiame etape ruošiame Supabase duomenų bazę. Atliekami veiksmai nepaliečia dar veikiančio lokaliojo saugojimo, todėl galima
testuoti paraleliai.

### 1. Migracijų paleidimas

1. Įsitikinkite, kad turite [Supabase CLI](https://supabase.com/docs/reference/cli/overview).
2. Prisijunkite prie projekto:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Paleiskite duomenų bazės migraciją:
   ```bash
   supabase db push --file supabase/migrations/0001_init.sql
   ```

> **Pastaba.** Scenarijus idempotentinis, todėl galima kartoti. Jei naudojate naršyklinį SQL redaktorių, nukopijuokite visą
> failo turinį ir paleiskite vienu kartu.

### 2. Lovų išdėstymo importas

1. Atsisiųskite `supabase/seeds/bed_layout.csv`.
2. Supabase valdymo pultuose pasirinkite lentelę `beds` → **Import** → įkelkite CSV.
3. Patikrinkite, kad lovų skaičius sutampa su CSV (šiuo metu 4 įrašai pavyzdžiui).

### Greitas patikrinimas

- SQL redaktoriuje įvykdykite `select * from aggregated_bed_state;`.
- Turėtumėte matyti bent keturias lovas su `NULL` statusais/užimtumu.

## Diegimas

1. Atsisiųskite visus failus
2. Atidarykite `index.html` naršyklėje
3. Arba naudokite vietinį serverį:
   ```bash
   python -m http.server 8000
   ```
4. Eikite į `http://localhost:8000`

## Duomenų saugojimas

Visi duomenys saugomi naršyklės `localStorage` ir yra:
- Automatiškai išsaugomi kiekvieno pakeitimo metu
- Eksportuojami JSON formatu
- Importuojami iš JSON failų
- Versijų kontrolės palaikymas

## Pranešimai

Sistema palaiko:
- Garso signalus (konfigūruojami)
- Naršyklės pranešimus (jei leista)
- Vizualius pranešimus sąsajoje
- Prioritetinį pranešimų rodymą

## Papildomų užduočių integracija

Norėdami įtraukti periodines ar ad hoc užduotis (pvz., laboratorinių mėginių pristatymą, pacientų vežimą į vaizdinius tyrimus), sekite [papildomą integracijos gidą](docs/additional-task-integration.md). Čia rasite rekomenduojamą `Task` modelio struktūrą, UI formų ir pranešimų praplėtimą, taip pat smoke testų kontrolinius sąrašus.

## Licencija
MIT © 2024 Rokas M.
