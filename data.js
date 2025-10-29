// Data handling utilities for Lovos Dashboard.
// CSV URL: adjust to your Google Sheets CSV link.
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=603256423&single=true&output=csv";

// Column name hints so sheet column order / language changes do not break the import.
const COLUMN_HINTS = {
  lova: {
    exact: ["Lova"],
    partial: ["lova", "lovos", "lova nr", "post", "bed"],
  },
  occupancy: {
    exact: ["Užimtumas", "Statusas"],
    partial: ["užimt", "occup", "status", "statusas", "dabart", "real"],
  },
  lastState: {
    exact: ["Paskutinė būsena"],
    partial: ["paskut", "istor", "pastaba", "last"],
  },
  freedAgo: {
    exact: ["Atlaisvinta prieš"],
    partial: ["atlais", "praėjo", "minutes", "val"],
  },
  finalState: {
    exact: ["Būsena", "Galutinė būsena", "Statusas"],
    partial: ["galutin", "busena", "emoji", "final", "status"],
  },
  slaState: {
    exact: ["Kontrolė"],
    partial: ["kontrol", "sla", "tvark", "kokyb"],
  },
  markedBy: {
    exact: ["Pažymėjo"],
    partial: ["pažym", "pazyme", "nurse", "user", "atsaking"],
  },
  timestamp: {
    exact: ["Timestamp"],
    partial: ["time", "laik"],
  },
};

function normalizeStatusText(value) {
  const raw = removeBom((value ?? '').toString()).trim();
  const normalized = stripDiacritics(raw).toLowerCase();
  return { raw, normalized };
}

export function interpretOccupancyState(value) {
  const { normalized } = normalizeStatusText(value);
  if (!normalized) return 'unknown';

  if (
    normalized.includes('🟥') ||
    normalized.includes('uzim') ||
    normalized.includes('occupied') ||
    normalized.includes('pacient') ||
    normalized.includes('patient')
  ) {
    return 'occupied';
  }

  if (
    normalized.includes('🟩') ||
    normalized.includes('laisv') ||
    normalized.includes('free') ||
    normalized.includes('neuzim') ||
    normalized.includes('sutvark') ||
    normalized.includes('clean')
  ) {
    return 'free';
  }

  if (
    normalized.includes('🟨') ||
    normalized.includes('valom') ||
    normalized.includes('ruos') ||
    normalized.includes('dezinf') ||
    normalized.includes('cleaning')
  ) {
    return 'cleaning';
  }

  return 'unknown';
}

function stripDiacritics(value) {
  return (typeof value.normalize === 'function' ? value.normalize('NFD') : value)
    .replace(/[\u0300-\u036f]/g, '');
}

function removeBom(value) {
  return value.replace(/^\ufeff/, '');
}

function normalizeName(value) {
  const str = removeBom((value || "").toString());
  const normalized = stripDiacritics(str);
  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseTimestampToMillis(input) {
  if (input === null || input === undefined) return null;
  const raw = removeBom(input.toString()).trim();
  if (!raw) return null;

  const sanitized = raw
    .replace(/\u00A0/g, ' ')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ');

  const candidateBase = sanitized.includes('T') ? sanitized : sanitized.replace(' ', 'T');
  const candidates = [
    candidateBase,
    candidateBase.replace(/\./g, '-'),
    `${candidateBase}Z`,
    sanitized,
  ];

  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Normalizuoja lovos identifikatorių taip, kad atitiktų makete naudojamus ID.
 * Pvz., "Lova 01" → "1", "lova nr. IT-2" → "IT2".
 * @param {string} raw
 * @returns {string}
 */
export function normalizeBedId(raw) {
  if (raw === null || raw === undefined) return '';
  const base = stripDiacritics(raw.toString()).trim();
  if (!base) return '';

  // Pašaliname žodžius „lova“, „nr.“ ir pan., paliekame tik identifikatorių simbolius.
  let cleaned = base
    .replace(/\b(lova|lovos|lova nr\.?|lovos nr\.?|nr\.?|no\.?|bed|post)\b/gi, ' ')
    .replace(/[\(\)\[\]\.:]/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  // Pašaliname tarpus ir brūkšnelius, kad gautume vientisą kodą.
  const collapsed = cleaned.replace(/[\s-]+/g, '');
  if (!collapsed) return '';

  const specialMatch = collapsed.match(/^(IT\d{1,2}|IZO|P\d{1,2}|S\d{1,2}|121A|121B)$/);
  if (specialMatch) {
    return specialMatch[0];
  }

  const numericWithSuffix = collapsed.match(/^0*(\d+)([A-Z])?$/);
  if (numericWithSuffix) {
    const [, digits, suffix] = numericWithSuffix;
    const normalizedDigits = String(Number(digits));
    return suffix ? `${normalizedDigits}${suffix}` : normalizedDigits;
  }

  const fallbackDigits = cleaned.match(/\d+/);
  if (fallbackDigits) {
    return String(Number(fallbackDigits[0]));
  }

  return collapsed;
}

function withBedIdentifiers(row, fallbackIndex = 0) {
  const candidateId = row?.bedId || row?.lova || '';
  const bedId = normalizeBedId(candidateId);
  const bedKey = bedId ? bedId.toLowerCase() : '';
  const timestampMs = Number.isFinite(row?.timestampMs)
    ? row.timestampMs
    : parseTimestampToMillis(row?.timestamp ?? '');
  return {
    ...row,
    order: typeof row?.order === 'number' ? row.order : fallbackIndex,
    bedId,
    bedKey,
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
  };
}

function timestampRank(row) {
  if (!row) return null;
  if (Number.isFinite(row.timestampMs)) return row.timestampMs;
  const parsed = parseTimestampToMillis(row?.timestamp ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function latestRowsByBed(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const candidateKey = row?.bedKey || normalizeBedId(row?.lova || row?.bedId || '');
    const key = (candidateKey || '').toString().trim().toLowerCase();
    if (!key) continue;

    const current = map.get(key);
    const incomingRank = timestampRank(row);
    const currentRank = timestampRank(current);
    const incomingOrderNumber = Number(row?.order);
    const incomingOrder = Number.isFinite(row?.order)
      ? row.order
      : (Number.isFinite(incomingOrderNumber) ? incomingOrderNumber : -Infinity);
    const currentOrderNumber = Number(current?.order);
    const currentOrder = Number.isFinite(current?.order)
      ? current.order
      : (Number.isFinite(currentOrderNumber) ? currentOrderNumber : -Infinity);

    const shouldReplace = (() => {
      if (!current) return true;
      if (incomingRank !== null && currentRank !== null) return incomingRank >= currentRank;
      if (incomingRank !== null) return true;
      if (currentRank !== null) return false;
      return incomingOrder >= currentOrder;
    })();

    if (shouldReplace) {
      map.set(key, { ...row, bedKey: key, timestampMs: incomingRank ?? currentRank ?? null });
    }
  }
  return map;
}

export function rowsToOccupancyEvents(rows = []) {
  const latest = latestRowsByBed(rows);
  const events = [];

  for (const [key, row] of latest.entries()) {
    const bedId = row?.bedId || normalizeBedId(row?.lova || '');
    if (!bedId) continue;

    const statusText = row?.uzimt || row?.galutine || row?.sla || '';
    const state = interpretOccupancyState(statusText);
    if (state === 'unknown') continue;

    const fallbackOrder = Number(row?.order);
    const timestampMs = Number.isFinite(row?.timestampMs)
      ? row.timestampMs
      : (Number.isFinite(fallbackOrder) ? fallbackOrder : Date.now());
    const iso = new Date(timestampMs).toISOString();

    events.push({
      id: `csv-${key}`,
      timestamp: iso,
      bedId,
      status: state === 'cleaning' ? 'free' : state,
      metadata: {
        source: 'csv',
        csvTimestamp: row?.timestamp ?? null,
        csvStatus: statusText || null,
      },
    });
  }

  return events;
}

function findColumnIndex(headers, hints) {
  const normalizedHeaders = headers.map(normalizeName);
  for (const candidate of hints.exact || []) {
    const target = normalizeName(candidate);
    const idx = normalizedHeaders.findIndex(h => h === target);
    if (idx !== -1) return idx;
  }
  for (const candidate of hints.partial || []) {
    const target = normalizeName(candidate);
    const idx = normalizedHeaders.findIndex(h => h.includes(target));
    if (idx !== -1) return idx;
  }
  return -1;
}

// --- Normalization helpers ---
function inferColumns(headers) {
  const map = {};
  map.lova = findColumnIndex(headers, COLUMN_HINTS.lova);
  map.uzimt = findColumnIndex(headers, COLUMN_HINTS.occupancy);
  map.pask = findColumnIndex(headers, COLUMN_HINTS.lastState);
  map.gHours = findColumnIndex(headers, COLUMN_HINTS.freedAgo);
  map.final = findColumnIndex(headers, COLUMN_HINTS.finalState);
  map.sla = findColumnIndex(headers, COLUMN_HINTS.slaState);
  map.who = findColumnIndex(headers, COLUMN_HINTS.markedBy);
  map.timestamp = findColumnIndex(headers, COLUMN_HINTS.timestamp);
  return map;
}

function normalizeRows(raw, fields = []) {
  if (!raw.length) return [];
  const header = fields.length ? fields : Object.keys(raw[0]);
  const idx = inferColumns(header);
  const missing = Object.entries(idx)
    .filter(([, value]) => value === -1)
    .map(([key]) => key);
  if (missing.length) {
    console.warn("CSV stulpeliai nerasti, naudojamos tuščios reikšmės:", missing.join(", "));
  }
  const get = (row, i) => (i >= 0 ? row[header[i]] : "");
  const toTrimmedString = (value) => {
    if (value === null || value === undefined) return '';
    return value.toString().trim();
  };

  return raw.map((row, i) => {
    const lova = toTrimmedString(get(row, idx.lova));
    const final = toTrimmedString(get(row, idx.final));
    const sla = toTrimmedString(get(row, idx.sla));
    const uzimt = toTrimmedString(get(row, idx.uzimt));
    const gHours = toTrimmedString(get(row, idx.gHours));
    const pask = toTrimmedString(get(row, idx.pask));
    const who = toTrimmedString(get(row, idx.who));
    const timestamp = toTrimmedString(get(row, idx.timestamp));
    const timestampMs = parseTimestampToMillis(timestamp);

    const record = {
      order: i,
      lova,
      galutine: final,
      sla,
      uzimt,
      gHours,
      gHoursNum: Number(gHours?.toString().replace(",", ".")),
      pask,
      who,
      timestamp: idx.timestamp !== -1 ? (timestamp || "") : undefined,
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    };
    return withBedIdentifiers(record, i);
  });
}

// --- CSV loading ---
async function loadCSV() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CSV šaltinis grąžino klaidą: ${res.status}`);
  }

  const contentType = res.headers?.get?.('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('CSV šaltinis grąžino HTML turinį, patikrinkite prieigos nuostatas.');
  }

  const csv = await res.text();
  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (Array.isArray(results?.data) && results.data.length) {
          resolve(results);
          return;
        }
        if (Array.isArray(results?.errors) && results.errors.length) {
          const message = results.errors[0]?.message || 'CSV parse klaida';
          reject(new Error(message));
          return;
        }
        reject(new Error('CSV šaltinis grąžino tuščius duomenis.'));
      },
      error: (err) => reject(err),
    });
  });
}

// Public API
export async function loadData() {
  try {
    const { data, meta } = await loadCSV();
    const rows = normalizeRows(data, meta?.fields || []);
    // Cache rezultatus lokalioje saugykloje, kad veiktų offline.
    localStorage.setItem('cachedRows', JSON.stringify(rows));
    return rows;
  } catch (err) {
    console.error('Nepavyko įkelti CSV, bandoma naudoti talpyklą', err);
    try {
      const cached = JSON.parse(localStorage.getItem('cachedRows') || 'null');
      if (cached) return cached.map((row, index) => withBedIdentifiers(row, index));
    } catch (e) {
      console.error('Nepavyko nuskaityti talpyklos', e);
    }
    throw err;
  }
}
