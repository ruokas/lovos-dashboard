# Lovos Dashboard

Minimalus statinis skydelis realiu laiku rodyti lovų būklę iš Google Sheets.

## Naudojimas
1. Atsisiųskite arba klonuokite šį repo.
2. Atidarykite `index.html` naršyklėje (dvigubas spustelėjimas arba per `http-server`).
3. Duomenys automatiškai atnaujinami kas 10 s.

## CSV URL konfigūracija
1. Google Sheets → *File* → *Share* → *Publish to web* → pasirinkite **CSV**.
2. Nukopijuokite sugeneruotą nuorodą.
3. `app.js` faile pakeiskite `CSV_URL` konstantą į savo nuorodą.

## Smoke test
1. Atidarykite `index.html`.
2. Patikrinkite paieškos lauką ir filtrus „Būsena“ bei „SLA“.
3. Išbandykite rikiavimą iš sąrašo „Rikiuoti pagal…“.
4. Paspauskite `Atnaujinti` – lentelė turėtų persikrauti be klaidų.

## Struktūra
- `index.html` – pagrindinis dashboardas.
- `app.js` – duomenų logika.
- `styles.css` – stiliai.
- `README.md` – dokumentacija.
- `LICENSE` – MIT licencija.

## Licencija
MIT © 2024 Rokas M.
