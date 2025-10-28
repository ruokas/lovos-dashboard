/**
 * Nuotolinės paslaugos konfigūracijos nuskaitymas iš HTML atributų ar aplinkos kintamųjų.
 * ĮSPĖJIMAS: Anon raktas skirtas tik naudoti saugioje vidinėje aplinkoje – neplatinkite jo viešai.
 */
const WARNING_MESSAGE = 'Nuotolinės paslaugos anon raktas skirtas tik testavimui ir vidiniam naudojimui. Neplatinkite viešai.';

/**
 * Suranda elementą su `data-supabase-url` ir `data-supabase-key` atributais.
 * @param {Document|undefined} doc - Galima pateikti testuose (pvz., JSDOM dokumentą).
 * @returns {{url?: string, key?: string}}
 */
function readFromDocument(doc) {
  if (!doc) return {};

  const candidates = [
    doc.querySelector('[data-supabase-url][data-supabase-key]'),
    doc.documentElement,
    doc.body,
  ].filter(Boolean);

  for (const element of candidates) {
    const dataset = element.dataset ?? {};
    const url = dataset.supabaseUrl ?? dataset.supabaseurl ?? dataset.supabaseURL;
    const key = dataset.supabaseKey ?? dataset.supabasekey ?? dataset.supabaseKEY;
    if (url && key) {
      return { url: url.trim(), key: key.trim() };
    }
  }

  const metaUrl = doc.querySelector('meta[name="supabase-url"], meta[name="supabase_url"]');
  const metaKey = doc.querySelector('meta[name="supabase-key"], meta[name="supabase_key"]');

  return {
    url: metaUrl?.getAttribute('content')?.trim(),
    key: metaKey?.getAttribute('content')?.trim(),
  };
}

/**
 * Perskaito reikšmes iš Node.js aplinkos, jei jos naudojamos testuose ar CLI įrankiuose.
 * @returns {{url?: string, key?: string}}
 */
function readFromEnv() {
  const url = typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined;
  const key = typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : undefined;
  return { url, key };
}

/**
 * Perskaito reikšmes iš Vite ar kitų bundlerių, kurie vartoja `import.meta.env`.
 * @returns {{url?: string, key?: string}}
 */
function readFromImportMeta() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env ?? {} : {};
  const url = env?.VITE_SUPABASE_URL ?? env?.SUPABASE_URL;
  const key = env?.VITE_SUPABASE_ANON_KEY ?? env?.SUPABASE_ANON_KEY;
  return { url, key };
}

/**
 * Grąžina galutinę nuotolinės paslaugos konfigūraciją. Mesti aiškią klaidą, jei trūksta duomenų.
 * @param {Document} [doc]
 * @returns {{url: string, key: string}}
 */
let hasWarned = false;

export function getSupabaseConfig(doc = typeof document !== 'undefined' ? document : undefined) {
  const sources = [readFromDocument(doc), readFromImportMeta(), readFromEnv()];
  const url = sources.map((item) => item.url).find((value) => !!value);
  const key = sources.map((item) => item.key).find((value) => !!value);

  if (!url || !key) {
    throw new Error('Nuotolinės paslaugos URL arba anon raktas nerastas. Patikrinkite `data-*` atributus ar aplinkos kintamuosius.');
  }

  if (typeof console !== 'undefined' && !hasWarned) {
    console.warn(WARNING_MESSAGE);
    hasWarned = true;
  }

  return { url, key };
}

export { WARNING_MESSAGE };
