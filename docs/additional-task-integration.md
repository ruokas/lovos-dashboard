# Papildomų užduočių įvedimo integracijos gidas

Šis dokumentas aprašo rekomenduojamus žingsnius, kaip lovų valdymo sistemoje įdiegti papildomų užduočių (pvz., laboratorinių tyrimų pristatymo, pacientų vežimo į vaizdinius tyrimus) įvedimą ir priežiūrą.

## 1. Duomenų modelio išplėtimas
- [ ] **Sukurti naują `Task` tipą** `models/bedData.js` faile: `id`, `tipas`, `susijusiLova`, `aprašymas`, `atsakingas`, `priminimoLaikas`, `būsena`.
- [ ] **Atskiras `TASK_TYPES` objektas** su pradiniu sąrašu („Laboratoriniai tyrimai“, „Vaizdiniai tyrimai“, „Transportavimas“, „Kita“). Tekstus laikyti `texts.js`.
- [ ] **`BedDataManager` papildymai**: metodai `addTask`, `updateTaskStatus`, `getActiveTasks`, `getTasksByBed`.
- [ ] **`DataPersistenceManager` papildymai**: `loadTasks()`, `saveTask(task)`, `updateTask(task)`. Užtikrinti migraciją esamiems vartotojams (`tasks` masyvas localStorage).

## 2. UI formos ir srautai
- [ ] **Sukurti naują modulį `forms/taskForm.js`** pagal `BedStatusForm` pavyzdį.
  - Reikalingi laukai: tipas (select), lova (neprivaloma), aprašymas, priminimo metas, atsakingas asmuo / pamaina.
  - Valdikliai: mygtukai „Išsaugoti“, „Pridėti priminimą“, „Atšaukti“.
  - Pridėti klaviatūros šauktinį (pvz., `Ctrl+Shift+L` – laboratorijai).
- [ ] **Greito pridėjimo mygtukas** pagrindinėje įrankių juostoje (`index.html` → naujas `<button id="addTaskBtn">` su LT tekstu).
- [ ] **Užduočių sąrašas lovų kortelėse** (`grid.js`): rodyti aktyvių užduočių ženkliukus; `title` atributas su santrauka.
- [ ] **Dedikuotas „Užduočių skydelis“** (modalas ar šoninis panelis) su filtrais pagal tipą, lovą, laiką.

## 3. Priminimai ir pranešimai
- [ ] `NotificationManager` papildyti `scheduleTaskReminder(task)` metodu.
- [ ] Įtraukti `navigator.wakeLock` alternatyvą (jei leidžia aplinka) arba periodinį `setInterval` tikrinimą kas 1 min.
- [ ] Vizualūs indikatoriai (`styles.css`): spalvų kodai pagal tipą, statusą (pvz., raudona – vėluoja, geltona – netrukus, žalia – atlikta).
- [ ] Garso signalas (`settings`) su atskiru jungikliu „Užduočių priminimai“.

## 4. Procesų integracija
- [ ] **Nustatymai**: `settings/settingsManager.js` papildyti laukais `defaultTaskReminderMinutes`, `taskSoundEnabled`, `taskAutoAssignRole`.
- [ ] **Prieigos kontrolė** (jei reikia): minimalūs vartotojų vaidmenys („Slaugytoja“, „Paramedikas“, „Registratūra“).
- [ ] **Ataskaitos**: `persistence` ir (pasirinktinai) eksportas į CSV (`exportTasks()` funkcija) atskiram auditui.

## 5. Testavimas ir kokybė
- [ ] **Smoke test**:
  1. Atidaryti programą → pridėti laboratorinę užduotį be lovos → patikrinti sąraše.
  2. Pridėti transportavimo užduotį su lova → matyti lovos kortelėje.
  3. Nustatyti priminimą 1 min → gauti naršyklės pranešimą ir garsą.
  4. Pažymėti užduotį kaip įvykdytą → nebematyti aktyvių.
  5. Perkrauti puslapį → užduotys išsaugotos.
- [ ] **Vienetiniai testai (pasirinktinai)**: nauji metodai `BedDataManager` ir `NotificationManager` (naudojant `module-test.js`).

## 6. Diegimas ir palaikymas
- [ ] Atnaujinti `README.md` su nauju skyriumi „Papildomos užduotys“.
- [ ] Įtraukti demonstracinį JSON (`data.js`) su keliomis užduotimis.
- [ ] Apmokyti personalą: sutrumpinti įvedimo laiką, nustatyti atsakingus.

> **Pastaba:** kiekvieną žingsnį galima įgyvendinti iteratyviai – pirmiausia pridėti bazinį užduočių sąrašą be priminimų, vėliau įjungti pranešimus ir automatizacijas.
