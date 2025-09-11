# Lovos Dashboard

Minimalus statinis skydelis realiu laiku rodyti lovų būklę iš Google Sheets.

## Naudojimas
1. Atsisiųskite arba klonuokite šį repo.
2. Atidarykite `index.html` naršyklėje (dvigubas spustelėjimas arba per `http-server`).
3. Duomenys automatiškai atnaujinami kas 10 s.

## CSV URL konfigūracija
1. Google Sheets → *File* → *Share* → *Publish to web* → pasirinkite **CSV**.
2. Nukopijuokite sugeneruotą nuorodą.
3. `index.html` faile pakeiskite `CSV_URL` konstantą į savo nuorodą.

## Smoke test
1. Atidarykite `index.html`.
2. Išbandykite paieškos lauką ir filtrus „Būsena“ bei „SLA“.
3. Keiskite rikiavimą iš sąrašo „Rikiuoti pagal…“.
4. Spauskite `Atnaujinti` – lentelė turi persikrauti be klaidų.

## Struktūra
- `index.html` – pagrindinis dashboardas.
- `README.md` – šis failas.
- `LICENSE` – MIT licencija.

## Licencija
MIT, žr. `LICENSE` failą.
