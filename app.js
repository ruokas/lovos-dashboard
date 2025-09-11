// Tamsus režimas pagal paros laiką: nuo 19:00 iki 7:00
(function () {
  const h = new Date().getHours();
  if (h >= 19 || h < 7) {
    document.documentElement.classList.add('dark');
  }
})();

// CSV nuoroda: įklijuokite publikuotą CSV URL iš Google Sheets.
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=208986390&single=true&output=csv";

// Stulpelių pavadinimų žemėlapis, kad tvarka lapo būtų nesvarbi.
const COLS = {
  lova: ["Lova"],
  uzimtumas: ["Užimtumas"],
  paskutineBusena: ["Paskutinė būsena"],
  atlaisvintaPries: ["Atlaisvinta prieš"],
  galutineBusena: ["Būsena"],
  slaBusena: ["Kontrolė"],
  kasPazymejo: ["Pažymėjo"],
};

// Funkcija statuso prioritetui: 🧹 (0) > 🚫 (1) > 🟩 (2).
function statusPriority(s) {
  if (!s) return 99;
  const ch = s.trim().charAt(0);
  if (ch === "🧹") return 0;
  if (ch === "🚫") return 1;
  if (ch === "🟩") return 2;
  return 9;
}

// KPI kortelių atvaizdavimas.
function renderKPIs(rows) {
  const kpis = [
    { label: "Reikia sutvarkyti", value: rows.filter(r => (r.galutine || "").startsWith("🧹")).length, cls: "bg-orange-100 text-orange-800" },
    { label: "Užimta", value: rows.filter(r => (r.galutine || "").startsWith("🚫")).length, cls: "bg-rose-100 text-rose-800" },
    { label: "Sutvarkyta", value: rows.filter(r => (r.galutine || "").startsWith("🟩")).length, cls: "bg-emerald-100 text-emerald-800" },
    { label: "SLA viršyta", value: rows.filter(r => r.sla === "⛔ Viršyta").length, cls: "bg-red-100 text-red-800" },
  ];
  const el = document.getElementById("kpis");
  el.innerHTML = kpis.map(k =>
    `<div class="card p-4 bg-white dark:bg-slate-800">
       <div class="text-xs text-slate-500 dark:text-slate-400">${k.label}</div>
       <div class="text-3xl font-semibold ${k.cls} inline-block rounded-lg px-3 py-1 mt-1">${k.value}</div>
     </div>`
  ).join("");
}

// Ženkliukai statusui.
function pillForStatus(s) {
  if (!s) return `<span class="status-pill bg-slate-200 text-slate-700">—</span>`;
  const icon = s.trim().charAt(0);
  if (icon === "🧹") return `<span class="status-pill bg-orange-100 text-orange-800">${s}</span>`;
  if (icon === "🚫") return `<span class="status-pill bg-rose-100 text-rose-800">${s}</span>`;
  if (icon === "🟩") return `<span class="status-pill bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="status-pill bg-slate-100 text-slate-700">${s}</span>`;
}

// Ženkliukai SLA.
function pillForSLA(s) {
  if (s === "⛔ Viršyta") return `<span class="badge bg-red-100 text-red-800">${s}</span>`;
  if (s === "⚠️ Ką tik atlaisvinta") return `<span class="badge bg-amber-100 text-amber-800">${s}</span>`;
  if (s === "⚪ Laukia (≤ SLA)") return `<span class="badge bg-sky-100 text-sky-800">${s}</span>`;
  if (s === "✅ Atlikta laiku") return `<span class="badge bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s || "—"}</span>`;
}

// Data normalizacija.
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
      order: i, // Eilutės numeris Google Sheet'e rikiavimui
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

// CSV įkėlimas per PapaParse.
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

// Filtrai ir rikiavimas.
function applyFilters(rows) {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const fS = document.getElementById("filterStatus").value;
  const fSLA = document.getElementById("filterSLA").value;
  return rows.filter((r) => {
    if (fS && !(r.galutine || "").startsWith(fS)) return false;
    if (fSLA && (r.sla || "") !== fSLA) return false;
    if (q) {
      const blob = [r.lova, r.galutine, r.sla, r.uzimt, r.pask, r.who].join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}
function sortRows(rows) {
  const mode = document.getElementById("sort").value;
  if (mode === "bed") {
    // Rikiuojame pagal eilės numerį iš Google Sheet'e
    rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } else if (mode === "wait") {
    rows.sort((a, b) => (Number(b.gHoursNum) || 0) - (Number(a.gHoursNum) || 0));
  } else {
    rows.sort((a, b) => {
      const pDiff = statusPriority(a.galutine) - statusPriority(b.galutine);
      if (pDiff !== 0) return pDiff;
      const slaScore = (s) => (s === "⛔ Viršyta" ? 0 : s === "⚠️ Ką tik atlaisvinta" ? 1 : 2);
      const sDiff = slaScore(a.sla) - slaScore(b.sla);
      if (sDiff !== 0) return sDiff;
      return (a.lova || "").localeCompare(b.lova || "", "lt");
    });
  }
}

/**
 * Konvertuoja valandas (skaičių) į "X val Y min" formatą.
 * @param {number} hours
 * @returns {string}
 */
function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} val`);
  if (m > 0 || h === 0) parts.push(`${m} min`);
  return parts.join(" ");
}

function renderTable(rows) {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
          <td class="px-4 py-3 text-lg font-medium">${r.lova || "—"}</td>
          <td class="px-4 py-3 text-lg">${pillForStatus(r.galutine)}</td>
          <td class="px-4 py-3 text-lg">${pillForSLA(r.sla)}</td>
          <td class="px-4 py-3 text-lg">${r.uzimt || "—"}</td>
          <td class="px-4 py-3 text-lg">${
            r.gHours ? `<span class="mono">${formatDuration(r.gHoursNum)}</span>` : "—"
          }</td>
          <td class="px-4 py-3 text-lg">${r.pask || "—"}</td>
          <td class="px-4 py-3 text-lg">${r.who || "—"}</td>
        </tr>
      `
    )
    .join("");
}

async function refresh() {
  try {
    const raw = await loadCSV();
    const rows = normalizeRows(raw);
    const filtered = applyFilters(rows);
    sortRows(filtered);
    renderKPIs(filtered);
    renderTable(filtered);
    document.getElementById("updatedAt").textContent =
      "Atnaujinta: " + new Date().toLocaleString("lt-LT");
  } catch (err) {
    console.error(err);
    document.getElementById("updatedAt").textContent = "Klaida įkeliant duomenis.";
  }
}

// Event’ai
 document.getElementById("refreshBtn").addEventListener("click", refresh);
 document.getElementById("filterStatus").addEventListener("change", refresh);
 document.getElementById("filterSLA").addEventListener("change", refresh);
 document.getElementById("sort").addEventListener("change", refresh);
 document.getElementById("search").addEventListener("input", refresh);
 // Initial refresh and auto-refresh every 10 seconds
 refresh();
 setInterval(refresh, 10000);

