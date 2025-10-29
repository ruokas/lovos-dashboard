import { loadData } from './data.js';
import { bedLayout } from './layout.js';
import { pillForOccupancy } from './utils/ui.js';
import { texts, t } from './texts.js';

let lastRows = [];
const grid = document.getElementById('bedGrid');
const container = grid?.parentElement?.parentElement;
// Proporcija tarp pločio ir aukščio (mažina kortelės aukštį).
// 1 reikštų kvadratą; 0.75 – žemesnę kortelę.
const HEIGHT_RATIO = 0.75;

function normalizeStatus(text) {
  const raw = (text || "").toString();
  const normalized = typeof raw.normalize === 'function' ? raw.normalize("NFD") : raw;
  return normalized
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function renderGrid(rows) {
  lastRows = rows;
  if (!grid) return;

  const maxCol = Math.max(...bedLayout.map(b => b.col));
  const maxRow = Math.max(...bedLayout.map(b => b.row));

  const parent = grid.parentElement;
  const wrapper = parent.parentElement;
  const availableWidth = parent.clientWidth;
  const availableHeight = wrapper?.clientHeight || parent.clientHeight || window.innerHeight;

  const styles = getComputedStyle(grid);
  const gapX = parseFloat(styles.columnGap || styles.gap) || 0;
  const gapY = parseFloat(styles.rowGap || styles.gap) || 0;
  const totalGapX = gapX * (maxCol - 1);
  const totalGapY = gapY * (maxRow - 1);

  // Plotis parenkamas pagal turimą vietą, o aukštis – pagal nurodytą proporciją.
  const autoCellWidth = Math.floor((availableWidth - totalGapX) / maxCol);
  let cellWidth = Math.max(autoCellWidth, 60);
  if (parent) {
    if (cellWidth > autoCellWidth) parent.classList.add('overflow-x-auto');
    else parent.classList.remove('overflow-x-auto');
  }
  const maxHeight = Math.floor((availableHeight - totalGapY) / maxRow);
  const cellHeight = Math.min(Math.floor(cellWidth * HEIGHT_RATIO), maxHeight);

  grid.style.gridTemplateColumns = `repeat(${maxCol}, ${cellWidth}px)`;
  grid.style.gridTemplateRows = `repeat(${maxRow}, ${cellHeight}px)`;
  grid.style.width = `${cellWidth * maxCol + totalGapX}px`;
  grid.style.height = `${cellHeight * maxRow + totalGapY}px`;

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const statusText = data.uzimt || data.galutine || data.sla || '';
    const normalized = normalizeStatus(`${data.uzimt || ''} ${data.galutine || ''}`);
    const isOccupied = normalized.includes('uzim') || normalized.includes('occupied') || normalized.includes('pacient');
    const isClean = normalized.includes('🟩') || normalized.includes('sutvark') || normalized.includes('clean');
    const statusClass = isOccupied ? 'occupied' : (isClean ? 'clean' : 'dirty');
    const meta = [
      data.galutine && data.galutine !== statusText ? `<span class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">${data.galutine}</span>` : '',
      data.sla && data.sla !== statusText ? `<span class="text-xs sm:text-sm text-amber-600 dark:text-amber-400">${data.sla}</span>` : '',
      data.pask ? `<span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Paskutinė: ${data.pask}</span>` : '',
      data.gHours ? `<span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Atlaisvinta prieš: ${data.gHours}</span>` : '',
      data.who ? `<span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Pažymėjo: ${data.who}</span>` : '',
      data.timestamp ? `<span class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Atnaujinta: ${data.timestamp}</span>` : '',
    ].filter(Boolean).join('');

    return `<div class="bed-cell ${statusClass}" style="grid-row:${bed.row};grid-column:${bed.col}">
        <div class="bed-id">${bed.id}</div>
        <div class="bed-info">
          ${pillForOccupancy(statusText)}
          ${meta}
        </div>
      </div>`;
  }).join('');
}

async function refresh() {
  const errorEl = document.getElementById('error');
  if (errorEl) errorEl.classList.add('hidden');
  try {
    const rows = await loadData();
    renderGrid(rows);
    const updatedEl = document.getElementById('updatedAt');
    if (updatedEl) {
      const prefix = navigator.onLine ? t(texts.updates.onlinePrefix) : t(texts.updates.offlinePrefix);
      updatedEl.textContent = prefix + new Date().toLocaleTimeString('lt-LT');
    }
  } catch (err) {
    const loadError = t(texts.messages.loadErrorShort);
    console.error(loadError, err);
    if (errorEl) {
      errorEl.textContent = loadError;
      errorEl.classList.remove('hidden');
    }
  }
}

document.getElementById('refreshBtn')?.addEventListener('click', refresh);
document.getElementById('listViewBtn')?.addEventListener('click', () => {
  window.location.href = 'index.html';
});

refresh();
setInterval(refresh, 30000);

if (container) {
  const ro = new ResizeObserver(() => {
    if (lastRows.length) renderGrid(lastRows);
  });
  ro.observe(container);
}
