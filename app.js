import { loadData } from "./data.js";
import { pillForOccupancy } from "./utils/ui.js";
import { texts, t } from "./texts.js";


const CRITICAL_PREFIXES = {
  cleaning: "🧹",
  sla: "⛔",
};

const AUDIO_PREF_KEY = "lovos-audio-enabled";

const SOUND_SOURCES = {
  sla: "data:audio/wav;base64,UklGRqQCAABXQVZFZm10IBAAAAABAAEAoA8AAEAfAAACABAAZGF0YYACAAAAADU/xhP7xmPaQC3GM/PiI8MCCv8/Agojw/PixjNALWPa+8bGEzU/AADLwDrsBTmdJcDSOswNHd08/vUBwP713TwNHTrMwNKdJQU5OuzLwAAANT/GE/vGY9pALcYz8+IjwwIK/z8CCiPD8+LGM0AtY9r7xsYTNT8AAMvAOuwFOZ0lwNI6zA0d3Tz+9QHA/vXdPA0dOszA0p0lBTk67MvAAAA1P8YT+8Zj2kAtxjPz4iPDAgr/PwIKI8Pz4sYzQC1j2vvGxhM1PwAAy8A67AU5nSXA0jrMDR3dPP71AcD+9d08DR06zMDSnSUFOTrsy8AAADU/xhP7xmPaQC3GM/PiI8MCCv8/Agojw/PixjNALWPa+8bGEzU/AADLwDrsBTmdJcDSOswNHd08/vUBwP713TwNHTrMwNKdJQU5OuzLwAAANT/GE/vGY9pALcYz8+IjwwIK/z8CCiPD8+LGM0AtY9r7xsYTNT8AAMvAOuwFOZ0lwNI6zA0d3Tz+9QHA/vXdPA0dOszA0p0lBTk67MvAAAA1P8YT+8Zj2kAtxjPz4iPDAgr/PwIKI8Pz4sYzQC1j2vvGxhM1PwAAy8A67AU5nSXA0jrMDR3dPP71AcD+9d08DR06zMDSnSUFOTrsy8AAADU/xhP7xmPaQC3GM/PiI8MCCv8/Agojw/PixjNALWPa+8bGEzU/AADLwDrsBTmdJcDSOswNHd08/vUBwP713TwNHTrMwNKdJQU5OuzLwAAANT/GE/vGY9pALcYz8+IjwwIK/z8CCiPD8+LGM0AtY9r7xsYTNT8AAMvAOuwFOZ0lwNI6zA0d3Tz+9QHA/vXdPA0dOszA0p0lBTk67MvAAAA1P8YT+8Zj2kAtxjPz4iPDAgr/PwIKI8Pz4sYzQC1j2vvGxhM1PwAAy8A67AU5nSXA0jrMDR3dPP71AcD+9d08DR06zMDSnSUFOTrsy8AAA",
  cleaning: "data:audio/wav;base64,UklGRqQCAABXQVZFZm10IBAAAAABAAEAoA8AAEAfAAACABAAZGF0YYACAAAAAMYz3TzGE2PaAcBj2sYT3TzGMwAAOswjwzrsnSX/P50lOuwjwzrMAADGM908xhNj2gHAY9rGE908xjMAADrMI8M67J0l/z+dJTrsI8M6zAAAxjPdPMYTY9oBwGPaxhPdPMYzAAA6zCPDOuydJf8/nSU67CPDOswAAMYz3TzGE2PaAcBj2sYT3TzGMwAAOswjwzrsnSX/P50lOuwjwzrMAADGM908xhNj2gHAY9rGE908xjMAADrMI8M67J0l/z+dJTrsI8M6zAAAxjPdPMYTY9oBwGPaxhPdPMYzAAA6zCPDOuydJf8/nSU67CPDOswAAMYz3TzGE2PaAcBj2sYT3TzGMwAAOswjwzrsnSX/P50lOuwjwzrMAADGM908xhNj2gHAY9rGE908xjMAADrMI8M67J0l/z+dJTrsI8M6zAAAxjPdPMYTY9oBwGPaxhPdPMYzAAA6zCPDOuydJf8/nSU67CPDOswAAMYz3TzGE2PaAcBj2sYT3TzGMwAAOswjwzrsnSX/P50lOuwjwzrM",
};

/**
 * @type {Set<string>}
 */
let lastCriticalKeys = new Set();

let audioEnabled = true;

if (typeof localStorage !== "undefined") {
  const stored = localStorage.getItem(AUDIO_PREF_KEY);
  if (stored !== null) {
    audioEnabled = stored === "true";
  }
}

const alertSounds = typeof Audio !== "undefined" ? {
  sla: new Audio(SOUND_SOURCES.sla),
  cleaning: new Audio(SOUND_SOURCES.cleaning),
} : {};

function playAlertSound(type) {
  const sound = alertSounds[type];
  if (!sound) return;
  try {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  } catch (err) {
    console.error("Nepavyko paleisti garso", err);
  }
}

function rowKey(row) {
  const trimmed = (row.lova || "").trim();
  if (trimmed) return trimmed;
  if (row.order !== undefined && row.order !== null) {
    return `row-${row.order}`;
  }
  return "row-unknown";
}

function buildCriticalSet(rows) {
  const set = new Set();
  rows.forEach((row) => {
    const key = rowKey(row);
    const status = (row.galutine || "").trim();
    const sla = (row.sla || "").trim();
    if (status.startsWith(CRITICAL_PREFIXES.cleaning)) {
      set.add(`cleaning|${key}`);
    }
    if (sla.startsWith(CRITICAL_PREFIXES.sla)) {
      set.add(`sla|${key}`);
    }
  });
  return set;
}

function detectNewCritical(previousSet, rows) {
  const nextSet = buildCriticalSet(rows);
  const newOnes = [];
  nextSet.forEach((entry) => {
    if (!previousSet.has(entry)) {
      newOnes.push(entry);
    }
  });
  return { nextSet, newOnes };
}

function updateAlertsUI(newKeys) {
  if (typeof document === "undefined") return new Set();
  const alertBox = document.getElementById("alerts");
  if (!alertBox) return new Set();
  if (!newKeys.length) {
    alertBox.textContent = "";
    alertBox.classList.add("hidden");
    alertBox.removeAttribute("data-type");
    return new Set();
  }
  const types = new Set();
  const highlightKeys = new Set();
  newKeys.forEach((key) => {
    const [type, rowId] = key.split("|");
    if (type) types.add(type);
    if (rowId) highlightKeys.add(rowId);
  });
  const messages = [];
  if (types.has("sla")) messages.push(t(texts.messages.newSlaBreach));
  if (types.has("cleaning")) messages.push(t(texts.messages.needsCleaningAlert));
  alertBox.textContent = messages.join(" • ");
  alertBox.classList.remove("hidden");
  alertBox.setAttribute("data-type", Array.from(types).join(" "));
  if (audioEnabled) {
    types.forEach((type) => playAlertSound(type));
  }
  return highlightKeys;
}

function updateAudioToggle(btn) {
  if (!btn) return;
  const label = audioEnabled ? t(texts.messages.soundOn) : t(texts.messages.soundOff);
  btn.textContent = label;
  btn.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
}

// Funkcija statuso prioritetui: 🧹 (0) > 🚫 (1) > 🟩 (2).
function statusPriority(s) {
  if (!s) return 99;
  const trimmed = s.trim();
  if (trimmed.startsWith("🧹")) return 0;
  if (trimmed.startsWith("🚫")) return 1;
  if (trimmed.startsWith("🟩")) return 2;
  return 9;
}

// KPI kortelių atvaizdavimas.
function renderKPIs(rows) {
  const kpis = [
    {
      label: t(texts.kpi.needsCleaning),
      value: rows.filter(r => (r.galutine || "").startsWith("🧹")).length,
      cls: "bg-yellow-100 text-yellow-800",
    },
    {
      label: t(texts.kpi.occupied),
      value: rows.filter(r => (r.galutine || "").startsWith("🚫")).length,
      cls: "bg-rose-100 text-rose-800",
    },
    {
      label: t(texts.kpi.cleaned),
      value: rows.filter(r => (r.galutine || "").startsWith("🟩")).length,
      cls: "bg-emerald-100 text-emerald-800",
    },
    {
      label: t(texts.kpi.slaBreached),
      value: rows.filter(r => r.sla === t(texts.sla.exceeded)).length,
      cls: "bg-red-100 text-red-800",
    },
  ];
  const el = document.getElementById("kpis");
  el.innerHTML = kpis
    .map(
      (k, idx) =>
        `<article class="card kpi-card bg-white dark:bg-slate-800" aria-labelledby="kpi-${idx}">
           <h3 id="kpi-${idx}" class="kpi-title" title="${k.label}">${k.label}</h3>
           <div class="kpi-value ${k.cls}" aria-live="polite">${k.value}</div>
         </article>`
    )
    .join("");
}

// Ženkliukai statusui.
function pillForStatus(s) {
  const dash = t(texts.common.dash);
  if (!s) return `<span class="status-pill bg-slate-200 text-slate-700">${dash}</span>`;
  const icon = s.trim().charAt(0);
  if (icon === "🧹") return `<span class="status-pill bg-yellow-100 text-yellow-800">${s}</span>`;
  if (icon === "🚫") return `<span class="status-pill bg-rose-100 text-rose-800">${s}</span>`;
  if (icon === "🟩") return `<span class="status-pill bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="status-pill bg-slate-100 text-slate-700">${s}</span>`;
}

// Ženkliukai SLA.
function pillForSLA(s) {
  const slaExceeded = t(texts.sla.exceeded);
  const slaJustFreed = t(texts.sla.justFreed);
  const slaWaitingWithin = t(texts.sla.waitingWithin);
  const slaOnTime = t(texts.sla.onTime);
  const dash = t(texts.common.dash);
  if (s === slaExceeded) return `<span class="badge bg-red-100 text-red-800">${slaExceeded}</span>`;
  if (s === slaJustFreed) return `<span class="badge bg-amber-100 text-amber-800">${slaJustFreed}</span>`;
  if (s === slaWaitingWithin) return `<span class="badge bg-sky-100 text-sky-800">${slaWaitingWithin}</span>`;
  if (s === slaOnTime) return `<span class="badge bg-emerald-100 text-emerald-800">${slaOnTime}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s || dash}</span>`;
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
    const slaExceeded = t(texts.sla.exceeded);
    const slaJustFreed = t(texts.sla.justFreed);
    rows.sort((a, b) => {
      const pDiff = statusPriority(a.galutine) - statusPriority(b.galutine);
      if (pDiff !== 0) return pDiff;
      const slaScore = (s) => (s === slaExceeded ? 0 : s === slaJustFreed ? 1 : 2);
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
  const hoursLabel = t(texts.time.hours);
  const minutesLabel = t(texts.time.minutes);
  if (h > 0) parts.push(`${h} ${hoursLabel}`);
  if (m > 0 || h === 0) parts.push(`${m} ${minutesLabel}`);
  return parts.join(" ");
}

// Spalvinis indikatorius laukimo laikui.
function pillForWait(hours) {
  const dash = t(texts.common.dash);
  if (!Number.isFinite(hours)) return `<span class="badge bg-slate-100 text-slate-700">${dash}</span>`;
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

function renderTable(rows, highlightKeys = new Set()) {
  const tbody = document.getElementById("tbody");
  const dash = t(texts.common.dash);
  tbody.innerHTML = rows
    .map(
      (r) => {
        const key = rowKey(r);
        const isCritical = highlightKeys.has(key);
        const criticalAttr = isCritical ? ' data-critical="true"' : "";
        const rowClass = `odd:bg-slate-50 even:bg-white dark:odd:bg-slate-800 dark:even:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm md:text-base${isCritical ? " pulse-critical" : ""}`;
        return `
        <tr class="${rowClass}"${criticalAttr}>
          <td class="px-3 md:px-4 py-3 text-base md:text-lg font-semibold md:font-medium leading-6 md:leading-7 align-top whitespace-nowrap">${r.lova || dash}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top">${pillForStatus(r.galutine)}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top">${pillForSLA(r.sla)}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top">${pillForOccupancy(r.uzimt)}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top">${pillForWait(r.gHoursNum)}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top break-words">${r.pask || dash}</td>
          <td class="px-3 md:px-4 py-3 text-sm md:text-lg leading-6 md:leading-7 align-top break-words">${r.who || dash}</td>
        </tr>
      `;
      }
    )
    .join("");
}

async function refresh() {
  const loader = document.getElementById("loader");
  loader.classList.remove("hidden");
  try {
    const rows = await loadData();
    const { nextSet, newOnes } = detectNewCritical(lastCriticalKeys, rows);
    lastCriticalKeys = nextSet;
    const highlightKeys = updateAlertsUI(newOnes);
    const filtered = applyFilters(rows);
    sortRows(filtered);
    renderKPIs(filtered);
    renderTable(filtered, highlightKeys);
    const prefix = navigator.onLine ? t(texts.updates.onlinePrefix) : t(texts.updates.offlinePrefix);
    document.getElementById("updatedAt").textContent =
      prefix + new Date().toLocaleString("lt-LT");
  } catch (err) {
    console.error(err);
    document.getElementById("updatedAt").textContent = t(texts.messages.loadError);
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
  updateAudioToggle(document.getElementById("audioToggle"));
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
  const audioToggle = document.getElementById("audioToggle");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(AUDIO_PREF_KEY, audioEnabled ? "true" : "false");
      }
      updateAudioToggle(audioToggle);
    });
  }
  refresh();
  setInterval(refresh, 30000);
}


export { formatDuration, applyFilters, statusPriority, detectNewCritical, buildCriticalSet };
