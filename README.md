# Lovos Dashboard

Minimalus statinis skydelis realiu laiku rodyti lovų būklę iš Google Sheets.

## Naudojimas
1. Atsisiųskite arba klonuokite šį repo.
2. Atidarykite `index.html` naršyklėje (dvigubas spustelėjimas arba per `http-server`).
3. Duomenys automatiškai atnaujinami kas 30 s.
4. Viršuje esantis mygtukas „Tamsi tema“ leidžia perjungti šviesų/tamsų režimą (išsaugoma naršyklėje).

## CSV URL konfigūracija
1. Google Sheets → *File* → *Share* → *Publish to web* → pasirinkite **CSV**.
2. Nukopijuokite sugeneruotą nuorodą.
3. `data.js` faile pakeiskite `CSV_URL` konstantą į savo nuorodą.

## Smoke test
1. Atidarykite `index.html`.
2. Patikrinkite paieškos lauką ir filtrus „Būsena“ bei „SLA“.
3. Išbandykite rikiavimą iš sąrašo „Rikiuoti pagal…“.
4. Paspauskite `Atnaujinti` – lentelė turėtų persikrauti be klaidų.
5. Perjunkite temą mygtuku „Tamsi tema“ ir įsitikinkite, kad stilius keičiasi bei išlieka perkrovus puslapį.

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
