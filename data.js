// Data handling utilities for Lovos Dashboard.
// CSV URL: adjust to your Google Sheets CSV link.
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=603256423&single=true&output=csv";

// Column name mappings so sheet column order does not matter.
const COLS = {
  lova: ["Lova"],
  uzimtumas: ["Užimtumas"],
  paskutineBusena: ["Paskutinė būsena"],
  atlaisvintaPries: ["Atlaisvinta prieš"],
  galutineBusena: ["Būsena"],
  slaBusena: ["Kontrolė"],
  kasPazymejo: ["Pažymėjo"],
};

// --- Normalization helpers ---
function inferColumns(header) {
  const map = {};
  function find(names) {
    for (const n of names) {
      const idx = header.findIndex(h => h.trim().toLowerCase() === n.trim().toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  }
  map.lova = find(COLS.lova);
  map.uzimt = find(COLS.uzimtumas);
  map.pask = find(COLS.paskutineBusena);
  map.gHours = find(COLS.atlaisvintaPries);
  map.final = find(COLS.galutineBusena);
  map.sla = find(COLS.slaBusena);
  map.who = find(COLS.kasPazymejo);
  return map;
}

function normalizeRows(raw) {
  if (!raw.length) return [];
  const header = Object.keys(raw[0]);
  const idx = inferColumns(header);
  const get = (row, i) => (i >= 0 ? row[header[i]] : "");
  return raw.map((row, i) => {
    const lova = get(row, idx.lova);
    const final = get(row, idx.final);
    const sla = get(row, idx.sla);
    const uzimt = get(row, idx.uzimt);
    const gHours = get(row, idx.gHours);
    const pask = get(row, idx.pask);
    const who = get(row, idx.who);
    return {
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
  });
}

// --- CSV loading ---
async function loadCSV() {
  const res = await fetch(CSV_URL, { cache: "no-store" });
  const csv = await res.text();
  return new Promise((resolve) => {
    Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
    });
  });
}

// Public API
export async function loadData() {
  try {
    const raw = await loadCSV();
    const rows = normalizeRows(raw);
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
