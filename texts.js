/**
 * Centralizuotas tekstų žodynas.
 * `lt` – numatyta kalba, `en` laukeliai palikti būsimiems vertimams.
 */
export const DEFAULT_LANG = "lt";

export const texts = {
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
