const DEFAULT_LOCALE = 'lt-LT';

/**
 * Konvertuoja Supabase (UTC) laiko žymą į `Date` objektą.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseSupabaseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Suformatuoja UTC laiką į vietinį žmogui suprantamą formatą.
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatLocalDateTime(value, options = {}, locale = DEFAULT_LOCALE) {
  const date = parseSupabaseTimestamp(value);
  if (!date) return '';

  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options,
  });

  return formatter.format(date);
}

/**
 * Grąžina reliatyvų laiką nuo pateiktos datos iki dabar minutėmis.
 * @param {string|Date|null|undefined} value
 * @param {Date} [reference]
 * @returns {number|null}
 */
export function minutesSince(value, reference = new Date()) {
  const date = parseSupabaseTimestamp(value);
  if (!date) return null;
  return Math.round((reference.getTime() - date.getTime()) / 60000);
}
