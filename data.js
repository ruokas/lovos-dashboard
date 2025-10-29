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

function normalizeName(value) {
  const str = (value || "").toString();
  const normalized = typeof str.normalize === 'function' ? str.normalize("NFD") : str;
  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
  return raw.map((row, i) => {
    const lova = get(row, idx.lova);
    const final = get(row, idx.final);
    const sla = get(row, idx.sla);
    const uzimt = get(row, idx.uzimt);
    const gHours = get(row, idx.gHours);
    const pask = get(row, idx.pask);
    const who = get(row, idx.who);
    const timestamp = get(row, idx.timestamp);
    const record = {
      order: i,
      lova: lova || "",
      galutine: final || "",
      sla: sla || "",
      uzimt: uzimt || "",
      gHours: gHours || "",
      gHoursNum: Number(gHours?.toString().replace(",", ".")),
      pask: pask || "",
      who: who || "",
    };
    if (idx.timestamp !== -1) {
      record.timestamp = timestamp || "";
    }
    return record;
  });
}

// --- CSV loading ---
async function loadCSV() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  const csv = await res.text();
  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
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
      if (cached) return cached;
    } catch (e) {
      console.error('Nepavyko nuskaityti talpyklos', e);
    }
    throw err;
  }
}
