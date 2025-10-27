/**
 * Centralizuotas tekstų žodynas.
 * `lt` – numatyta kalba, `en` laukeliai palikti būsimiems vertimams.
 */
export const DEFAULT_LANG = "lt";

export const texts = {
  ui: {
    showBedList: { lt: 'Rodyti lovų sąrašą', en: '' },
    hideBedList: { lt: 'Slėpti lovų sąrašą', en: '' },
    showAuditLog: { lt: 'Rodyti veiksmų žurnalą', en: '' },
    hideAuditLog: { lt: 'Slėpti veiksmų žurnalą', en: '' },
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
  },
  notifications: {
    allClear: { lt: '✅ Visos lovos tvarkingos', en: '' },
  },
  forms: {
    validationError: { lt: "Prašome užpildyti visus privalomus laukus.", en: "" },
    descriptionRequired: { lt: "Aprašykite problemą, kai pasirenkama \"Kita\".", en: "" },
    submitInProgress: { lt: "Siunčiama...", en: "" },
    submitSuccess: { lt: "Duomenys išsaugoti.", en: "" },
    submitError: { lt: "Nepavyko išsaugoti duomenų. Pabandykite dar kartą.", en: "" },
    prefilledFromNfc: { lt: "Lova pasirinkta iš NFC žymos.", en: "" },
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
    title: { lt: "Prisijunkite prie Supabase", en: "" },
    description: {
      lt: "Įveskite skyriui priskirtą el. paštą ir slaptažodį, kad duomenys būtų sinchronizuojami per Supabase.",
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
    signOutSuccess: { lt: "Atsijungta. Prisijunkite iš naujo, kad pasiektumėte Supabase.", en: "" },
    offline: { lt: "Supabase neprieinamas – dirbama offline režimu.", en: "" },
    loginRequired: { lt: "Prisijunkite, kad pasiektumėte Supabase duomenis.", en: "" },
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
