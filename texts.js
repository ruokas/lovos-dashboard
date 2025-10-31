/**
 * Centralizuotas tekstų žodynas.
 * `lt` – numatyta kalba, `en` laukeliai palikti būsimiems vertimams.
 */
export const DEFAULT_LANG = "lt";

export const texts = {
  ui: {
    showBedList: { lt: 'Rodyti lovų sąrašą', en: '' },
    hideBedList: { lt: 'Slėpti lovų sąrašą', en: '' },
    showAuditLog: { lt: 'Veiksmų žurnalas', en: '' },
    bedLabel: { lt: 'Lova', en: '' },
    noBedsFound: { lt: 'Nerasta lovų pagal paiešką.', en: '' },
    lastChecked: { lt: 'Paskutinį kartą tikrinta', en: '' },
    checkedBy: { lt: 'Pažymėjo', en: '' },
    unknownUser: { lt: 'Nežinomas', en: '' },
    noData: { lt: 'Nėra duomenų', en: '' },
    listView: { lt: 'Sąrašo rodinys', en: '' },
    gridView: { lt: 'Tinklelio rodinys', en: '' },
  },
  theme: {
    dark: { lt: "Tamsi tema", en: "" },
    light: { lt: "Šviesi tema", en: "" },
  },
  kpi: {
    needsCleaning: { lt: "Reikia sutvarkyti", en: "" },
    occupied: { lt: "Užimta", en: "" },
    cleaned: { lt: "Sutvarkyta", en: "" },
    slaBreached: { lt: "SLA viršyta", en: "" },
  },
  sla: {
    exceeded: { lt: "⛔ Viršyta", en: "" },
    justFreed: { lt: "⚠️ Ką tik atlaisvinta", en: "" },
    waitingWithin: { lt: "⚪ Laukia (≤ SLA)", en: "" },
    onTime: { lt: "✅ Atlikta laiku", en: "" },
  },
  common: {
    dash: { lt: "—", en: "" },
  },
  time: {
    hours: { lt: "val", en: "" },
    minutes: { lt: "min", en: "" },
  },
  updates: {
    onlinePrefix: { lt: "Atnaujinta: ", en: "" },
    offlinePrefix: { lt: "Offline, rodoma talpykla: ", en: "" },
  },
  messages: {
    loadError: { lt: "Klaida įkeliant duomenis.", en: "" },
    loadErrorShort: { lt: "Nepavyko įkelti duomenų", en: "" },
    newSlaBreach: { lt: "Naujas SLA viršijimas", en: "" },
    needsCleaningAlert: { lt: "Reikia sutvarkyti lovą", en: "" },
    soundOn: { lt: "Garso signalai įjungti", en: "" },
    soundOff: { lt: "Garso signalai išjungti", en: "" },
    taskSaveError: { lt: 'Nepavyko sukurti užduoties.', en: 'Failed to create task.' },
  },
  notifications: {
    allClear: { lt: '✅ Visos lovos tvarkingos', en: '✅ All beds are ready' },
    nurseLabel: { lt: 'Slaugytoja', en: 'Nurse' },
  },
  tasks: {
    title: { lt: 'Skyrių užduotys', en: 'Ward tasks' },
    empty: { lt: 'Nėra užduočių pagal pasirinktus filtrus.', en: 'No tasks match the selected filters.' },
    searchLabel: { lt: 'Paieška', en: 'Search' },
    searchPlaceholder: { lt: 'Ieškoti užduoties...', en: 'Search tasks…' },
    statusFilterLabel: { lt: 'Būsena', en: 'Status' },
    zoneFilterLabel: { lt: 'Zona', en: 'Zone' },
    shortcutHint: { lt: 'Spartusis klavišas: Ctrl+Shift+T', en: 'Shortcut: Ctrl+Shift+T' },
    statusAll: { lt: 'Visos būsenos', en: 'All statuses' },
    zoneAll: { lt: 'Visos zonos', en: 'All zones' },
    newButton: { lt: 'Nauja užduotis', en: 'New task' },
    completeAction: { lt: 'Pažymėti kaip atliktą', en: 'Mark as completed' },
    completedLabel: { lt: 'Užduotis atlikta', en: 'Task completed' },
    status: {
      planned: { lt: 'Planuojama', en: 'Planned' },
      inProgress: { lt: 'Vykdoma', en: 'In progress' },
      completed: { lt: 'Užbaigta', en: 'Completed' },
      blocked: { lt: 'Sustabdyta', en: 'Blocked' },
    },
    recurrence: {
      none: { lt: 'Nepasikartojanti', en: 'One-off' },
      perShift: { lt: 'Kas pamainą', en: 'Per shift' },
      daily: { lt: 'Kasdien', en: 'Daily' },
      weekly: { lt: 'Kas savaitę', en: 'Weekly' },
    },
    zones: {
      laboratory: { lt: 'Laboratorija', en: 'Laboratory' },
      ambulatory: { lt: 'Ambulatorija', en: 'Outpatient clinic' },
      wards: { lt: 'Skyrius', en: 'Ward' },
    },
    labels: {
      responsible: { lt: 'Atsakingas', en: 'Responsible' },
      deadline: { lt: 'Terminas', en: 'Deadline' },
      due: { lt: 'Terminas', en: 'Due' },
      priority: { lt: 'Prioritetas', en: 'Priority' },
      recurrence: { lt: 'Pasikartojimas', en: 'Recurrence' },
      created: { lt: 'Sukurta', en: 'Created' },
      zone: { lt: 'Zona', en: 'Zone' },
      patientReference: { lt: 'Paciento duomenys', en: 'Patient details' },
      patientReferenceUnknown: { lt: 'nenurodyta', en: 'not provided' },
      zoneFallback: { lt: 'Zona', en: 'Zone' },
    },
    badges: {
      overdue: { lt: 'Vėluoja', en: 'Overdue' },
      critical: { lt: 'Kritinė', en: 'Critical' },
      high: { lt: 'Didelė svarba', en: 'High' },
      medium: { lt: 'Vidutinė', en: 'Medium' },
      low: { lt: 'Žema', en: 'Low' },
    },
  },
  forms: {
    validationError: { lt: 'Prašome užpildyti visus privalomus laukus.', en: 'Please complete the required fields.' },
    descriptionRequired: { lt: 'Aprašykite problemą, kai pasirenkama "Kita".', en: 'Describe the issue when choosing "Other".' },
    submitInProgress: { lt: 'Siunčiama...', en: 'Submitting…' },
    submitSuccess: { lt: 'Duomenys išsaugoti.', en: 'Data saved successfully.' },
    submitError: { lt: 'Nepavyko išsaugoti duomenų. Pabandykite dar kartą.', en: 'Saving failed. Try again.' },
    prefilledFromNfc: { lt: "Lova pasirinkta iš NFC žymos.", en: "" },
    task: {
      title: { lt: 'Nauja užduotis', en: 'Create task' },
      description: { lt: 'Aprašykite veiksmus ir įrašykite paciento duomenis.', en: 'Describe the action and include patient details.' },
      patientReferenceLabel: { lt: 'Paciento pavardė arba kortelės Nr.', en: 'Patient surname or chart number' },
      patientReferencePlaceholder: { lt: 'Pvz., Petraitis arba A12345', en: 'e.g. Doe or A12345' },
      descriptionLabel: { lt: 'Aprašymas', en: 'Description' },
      descriptionPlaceholder: { lt: 'Trumpai aprašykite, ką atlikti...', en: 'Describe what needs to be done…' },
      recurrenceLabel: { lt: 'Pasikartojimo intervalas', en: 'Recurrence' },
      frequencyLabel: { lt: 'Dažnis (minutėmis)', en: 'Frequency (minutes)' },
      frequencyPlaceholder: { lt: 'Pvz., 60', en: 'e.g. 60' },
      frequencyHelp: {
        lt: 'Naudojame terminą kaip pirmą atlikimo laiką. Jei paliksite tuščią, bus pritaikytas numatytasis dažnis pagal pasirinktą intervalą.',
        en: 'The deadline becomes the first run time. Leave empty to use the default cadence for the selected recurrence.',
      },
      deadlineLabel: { lt: 'Terminas', en: 'Deadline' },
      zoneLabel: { lt: 'Zona', en: 'Zone' },
      zonePlaceholder: { lt: 'Pasirinkite zoną', en: 'Choose a zone' },
      submitButton: { lt: 'Sukurti', en: 'Create' },
      cancelButton: { lt: 'Atšaukti', en: 'Cancel' },
      closeLabel: { lt: 'Uždaryti formą', en: 'Close form' },
      submitSuccess: { lt: 'Užduotis sukurta.', en: 'Task created.' },
    },
  },
  nfc: {
    notSupported: { lt: "NFC skaitytuvas neprieinamas šiame įrenginyje.", en: "" },
    lookupFailed: { lt: "Nepavyko nustatyti NFC žymos.", en: "" },
    tagNotFound: { lt: "NFC žyma neatpažinta.", en: "" },
    offlineMode: { lt: "NFC veikia tik offline režimu – suveskite lovą rankiniu būdu.", en: "" },
  },
  logger: {
    offline: { lt: "Veiksmas užfiksuotas tik vietoje (offline režimas).", en: "" },
  },
  auth: {
    title: { lt: "Prisijunkite prie sistemos", en: "" },
    description: {
      lt: "Įveskite skyriui priskirtą el. paštą ir slaptažodį, kad duomenys būtų sinchronizuojami su centrine sistema.",
      en: "",
    },
    emailLabel: { lt: "El. paštas", en: "" },
    passwordLabel: { lt: "Slaptažodis", en: "" },
    submit: { lt: "Prisijungti", en: "" },
    signingIn: { lt: "Jungiama...", en: "" },
    missingCredentials: { lt: "Įveskite el. paštą ir slaptažodį.", en: "" },
    signInError: { lt: "Nepavyko prisijungti. Patikrinkite duomenis.", en: "" },
    signedInAs: { lt: "Prisijungęs:", en: "" },
    signOut: { lt: "Atsijungti", en: "" },
    signOutSuccess: { lt: "Atsijungta. Prisijunkite iš naujo, kad pasiektumėte duomenis.", en: "" },
    offline: { lt: "Nuotolinė paslauga neprieinama – dirbama offline režimu.", en: "" },
    loginRequired: { lt: "Prisijunkite, kad pasiektumėte duomenis.", en: "" },
  },
};

export const currentLang = DEFAULT_LANG;

/**
 * Grąžina vertimą pagal aktyvią kalbą.
 * Jei pasirinkta kalba neturi teksto, naudojama numatyta `lt`.
 * @param {{[key: string]: string}} entry
 * @param {string} [lang=currentLang]
 * @returns {string}
 */
export function t(entry, lang = currentLang) {
  if (!entry) return "";
  return entry[lang] || entry[DEFAULT_LANG] || "";
}
