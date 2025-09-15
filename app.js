import { loadData } from "./data.js";


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
    { label: "Reikia sutvarkyti", value: rows.filter(r => (r.galutine || "").startsWith("🧹")).length, cls: "bg-yellow-100 text-yellow-800" },
    { label: "Užimta", value: rows.filter(r => (r.galutine || "").startsWith("🚫")).length, cls: "bg-rose-100 text-rose-800" },
    { label: "Sutvarkyta", value: rows.filter(r => (r.galutine || "").startsWith("🟩")).length, cls: "bg-emerald-100 text-emerald-800" },
    { label: "SLA viršyta", value: rows.filter(r => r.sla === "⛔ Viršyta").length, cls: "bg-red-100 text-red-800" },
  ];
  const el = document.getElementById("kpis");
  el.innerHTML = kpis.map(k =>
    `<div class="card p-4 bg-white dark:bg-slate-800 flex flex-col justify-between h-24">
         <div class="text-sm md:text-base leading-tight truncate text-slate-500 dark:text-slate-400">${k.label}</div>
         <div class="text-4xl md:text-5xl leading-none font-semibold ${k.cls} inline-block rounded-lg px-2 py-0.5 mt-1">${k.value}</div>
       </div>`
  ).join("");
}

// Ženkliukai statusui.
function pillForStatus(s) {
  if (!s) return `<span class="status-pill bg-slate-200 text-slate-700">—</span>`;
  const icon = s.trim().charAt(0);
  if (icon === "🧹") return `<span class="status-pill bg-yellow-100 text-yellow-800">${s}</span>`;
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

// Ženkliukai užimtumui.
function pillForOccupancy(s) {
  if (!s) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  const t = s.trim().toLowerCase();
  if (t.includes("užim")) return `<span class="badge bg-rose-100 text-rose-800">${s}</span>`;
  if (t.includes("laisv")) return `<span class="badge bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s}</span>`;
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

// Spalvinis indikatorius laukimo laikui.
function pillForWait(hours) {
  if (!Number.isFinite(hours)) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  if (hours > 2) return `<span class="badge bg-red-100 text-red-800 mono">${formatDuration(hours)}</span>`;
  if (hours > 1) return `<span class="badge bg-amber-100 text-amber-800 mono">${formatDuration(hours)}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700 mono">${formatDuration(hours)}</span>`;
}

/**
 * Grąžina funkciją, kuri paleis fn tik praėjus delay ms nuo paskutinio kvietimo.
 * Naudinga riboti dažną įvykių (pvz., input) apdorojimą.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function renderTable(rows) {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr class="odd:bg-slate-50 even:bg-white dark:odd:bg-slate-800 dark:even:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700">
          <td class="px-4 py-3 text-lg font-medium">${r.lova || "—"}</td>
          <td class="px-4 py-3 text-lg">${pillForStatus(r.galutine)}</td>
          <td class="px-4 py-3 text-lg">${pillForSLA(r.sla)}</td>
          <td class="px-4 py-3 text-lg">${pillForOccupancy(r.uzimt)}</td>
          <td class="px-4 py-3 text-lg">${pillForWait(r.gHoursNum)}</td>
          <td class="px-4 py-3 text-lg">${r.pask || "—"}</td>
          <td class="px-4 py-3 text-lg">${r.who || "—"}</td>
        </tr>
      `
    )
    .join("");
}

async function refresh() {
  const loader = document.getElementById("loader");
  loader.classList.remove("hidden");
  try {
    const rows = await loadData();
    const filtered = applyFilters(rows);
    sortRows(filtered);
    renderKPIs(filtered);
    renderTable(filtered);
    const prefix = navigator.onLine ? "Atnaujinta: " : "Offline, rodoma talpykla: ";
    document.getElementById("updatedAt").textContent =
      prefix + new Date().toLocaleString("lt-LT");
  } catch (err) {
    console.error(err);
    document.getElementById("updatedAt").textContent = "Klaida įkeliant duomenis.";
    loader.classList.add("hidden");
  } finally {
    loader.classList.add("hidden");
  }
}

// Išvalo paiešką, filtrus ir atstato numatytą rikiavimą.
function clearFilters() {
  const search = document.getElementById("search");
  const filterStatus = document.getElementById("filterStatus");
  const filterSLA = document.getElementById("filterSLA");
  const sort = document.getElementById("sort");
  if (search) search.value = "";
  if (filterStatus) filterStatus.value = "";
  if (filterSLA) filterSLA.value = "";
  if (sort) sort.value = "priority";
  refresh();
}

if (typeof document !== "undefined" && document.getElementById("refreshBtn")) {
  document.getElementById("refreshBtn").addEventListener("click", refresh);
  document.getElementById("gridViewBtn")?.addEventListener("click", () => {
    window.location.href = "grid.html";
  });
  document.getElementById("clearFilters").addEventListener("click", clearFilters);
  document.getElementById("filterStatus").addEventListener("change", refresh);
  document.getElementById("filterSLA").addEventListener("change", refresh);
  document.getElementById("sort").addEventListener("change", refresh);
  const search = document.getElementById("search");
  const debounced = debounce(refresh, 300);
  search.addEventListener("input", debounced);
  refresh();
  setInterval(refresh, 30000);
}



export { formatDuration, applyFilters };
