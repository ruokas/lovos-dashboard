import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/supabaseConfig.js';

let client;

/**
 * Sukuria ir grąžina bendrinamą Supabase kliento egzempliorių.
 * @param {Document} [doc] - Galima pateikti testuose, kad perskaitytų `data-*` atributus.
 */
export function getSupabaseClient(doc) {
  if (!client) {
    const { url, key } = getSupabaseConfig(doc);
    client = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
  }
  return client;
}

/**
 * Testų pagalbininkas – leidžia iš naujo sukurti klientą su kita konfigūracija.
 */
export function resetSupabaseClient() {
  client = undefined;
}
