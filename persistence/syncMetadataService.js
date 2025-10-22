import { parseSupabaseTimestamp } from '../utils/time.js';

/**
 * Paimamas naujausias `updated_at` iš `aggregated_bed_state` Supabase vaizdo.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<string|null>} ISO data arba null, jei nepavyko.
 */
export async function getLastSupabaseUpdate(client) {
  if (!client) return null;

  const { data, error } = await client
    .from('aggregated_bed_state')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Nepavyko gauti Supabase sinchronizacijos laiko: ${error.message}`);
  }

  const timestamp = data?.[0]?.updated_at ?? null;
  if (!timestamp) return null;

  const parsed = parseSupabaseTimestamp(timestamp);
  return parsed?.toISOString() ?? null;
}
