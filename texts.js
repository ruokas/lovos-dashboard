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
  },
  tasks: {
    title: { lt: 'Skyrių užduotys', en: 'Ward tasks' },
    empty: { lt: 'Nėra užduočių pagal pasirinktus filtrus.', en: 'No tasks match the selected filters.' },
    searchLabel: { lt: 'Paieška', en: 'Search' },
    searchPlaceholder: { lt: 'Ieškoti užduoties...', en: 'Search tasks…' },
    statusFilterLabel: { lt: 'Būsena', en: 'Status' },
    channelFilterLabel: { lt: 'Kanalas', en: 'Channel' },
    shortcutHint: { lt: 'Spartusis klavišas: Ctrl+Shift+T', en: 'Shortcut: Ctrl+Shift+T' },
    statusAll: { lt: 'Visos būsenos', en: 'All statuses' },
    channelAll: { lt: 'Visi kanalai', en: 'All channels' },
    newButton: { lt: 'Nauja užduotis', en: 'New task' },
    status: {
      planned: { lt: 'Planuojama', en: 'Planned' },
      inProgress: { lt: 'Vykdoma', en: 'In progress' },
      completed: { lt: 'Užbaigta', en: 'Completed' },
      blocked: { lt: 'Sustabdyta', en: 'Blocked' },
    },
    types: {
      patientCare: { lt: 'Pacientų priežiūra', en: 'Patient care' },
      logistics: { lt: 'Logistika', en: 'Logistics' },
      communication: { lt: 'Komunikacija', en: 'Communication' },
      training: { lt: 'Mokymai / instruktažas', en: 'Training / briefing' },
    },
    recurrence: {
      none: { lt: 'Nepasikartojanti', en: 'One-off' },
      perShift: { lt: 'Kas pamainą', en: 'Per shift' },
      daily: { lt: 'Kasdien', en: 'Daily' },
      weekly: { lt: 'Kas savaitę', en: 'Weekly' },
    },
    channels: {
      laboratory: { lt: 'Laboratorija', en: 'Laboratory' },
      ambulatory: { lt: 'Ambulatorija', en: 'Outpatient clinic' },
      wards: { lt: 'Stacionaras / skyrius', en: 'Inpatient ward' },
    },
    labels: {
      responsible: { lt: 'Atsakingas', en: 'Responsible' },
      deadline: { lt: 'Terminas', en: 'Deadline' },
      recurrence: { lt: 'Pasikartojimas', en: 'Recurrence' },
      created: { lt: 'Sukurta', en: 'Created' },
      channel: { lt: 'Kanalas', en: 'Channel' },
    },
    badges: {
      overdue: { lt: 'Vėluoja', en: 'Overdue' },
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
      description: { lt: 'Aprašykite veiksmus ir priskirkite atsakingą komandą.', en: 'Describe the action and assign the team.' },
      typeLabel: { lt: 'Užduoties tipas', en: 'Task type' },
      typePlaceholder: { lt: 'Pasirinkite tipą', en: 'Select a type' },
      descriptionLabel: { lt: 'Aprašymas', en: 'Description' },
      descriptionPlaceholder: { lt: 'Trumpai aprašykite, ką atlikti...', en: 'Describe what needs to be done…' },
      recurrenceLabel: { lt: 'Pasikartojimo intervalas', en: 'Recurrence' },
      ownerLabel: { lt: 'Atsakingas asmuo / komanda', en: 'Responsible person / team' },
      ownerPlaceholder: { lt: 'Pvz., M. Slaugytoja', en: 'e.g. Nurse M.' },
      deadlineLabel: { lt: 'Terminas', en: 'Deadline' },
      channelLabel: { lt: 'Kanalo pasirinkimas', en: 'Channel' },
      channelPlaceholder: { lt: 'Pasirinkite kanalą', en: 'Choose a channel' },
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
