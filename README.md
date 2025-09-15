# Lovos Dashboard

Minimalus statinis skydelis realiu laiku rodyti lovų būklę iš Google Sheets.

## Naudojimas
1. Atsisiųskite arba klonuokite šį repo.
2. Atidarykite `index.html` naršyklėje (dvigubas spustelėjimas arba per `http-server`).
3. Duomenys automatiškai atnaujinami kas 30 s.
4. Viršuje esantis mygtukas „Tamsi tema“ leidžia perjungti šviesų/tamsų režimą (išsaugoma naršyklėje).

## Spalvinė logika tinklelyje
- **Žalia** – laisva ir sutvarkyta lova.
- **Geltona** – laisva, bet nesutvarkyta.
- **Raudona** – lova užimta.

## CSV URL konfigūracija
1. Google Sheets → *File* → *Share* → *Publish to web* → pasirinkite **CSV**.
2. Nukopijuokite sugeneruotą nuorodą.
3. `data.js` faile pakeiskite `CSV_URL` konstantą į savo nuorodą.

## Testavimas
`npm test` – paleidžia vienetinius testus su Vitest.

## Smoke test
1. Atidarykite `index.html`.
2. Patikrinkite paieškos lauką ir filtrus „Būsena“ bei „SLA“.
3. Išbandykite rikiavimą iš sąrašo „Rikiuoti pagal…“.
4. Paspauskite `Atnaujinti` – lentelė turėtų persikrauti be klaidų.
5. Perjunkite temą mygtuku „Tamsi tema“ ir įsitikinkite, kad stilius keičiasi bei išlieka perkrovus puslapį.

## Naujos kalbos pridėjimas
1. `texts.js` faile kiekvieno rakto objekte užpildykite naujos kalbos lauką (pvz., `en`) paliktais tuščiais vertimais.
2. Jei norite, kad nauja kalba būtų numatyta, pakeiskite `DEFAULT_LANG` reikšmę `texts.js` faile (pagal poreikį papildykite loginą kalbos perjungimui).
3. Atnaujinkite statinius tekstus HTML failuose (`index.html`, `grid.html`) ir datas formatuojančius metodus (`toLocaleString`, `toLocaleTimeString`), kad atitiktų naują kalbą.
4. Perkraukite puslapį ir patikrinkite, ar visur rodomi teisingi vertimai.

## Struktūra
- `index.html` – pagrindinis dashboardas.
- `data.js` – duomenų įkėlimas ir normalizacija.
- `app.js` – UI logika.
- `grid.js` – (būsima) tinklelio logika.
- `styles.css` – stiliai.
- `README.md` – dokumentacija.
- `LICENSE` – MIT licencija.

## Licencija
MIT © 2024 Rokas M.
