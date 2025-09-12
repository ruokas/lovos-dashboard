import { loadData } from './data.js';
import { bedLayout } from './layout.js';

let lastRows = [];
const grid = document.getElementById('bedGrid');
const container = grid?.parentElement?.parentElement;
// Proporcija tarp pločio ir aukščio (mažina kortelės aukštį).
// 1 reikštų kvadratą; 0.75 – žemesnę kortelę.
const HEIGHT_RATIO = 0.75;

function pillForOccupancy(s) {
  if (!s) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  const t = s.trim().toLowerCase();
  if (t.includes('užim')) return `<span class="badge bg-rose-100 text-rose-800">${s}</span>`;
  if (t.includes('laisv')) return `<span class="badge bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s}</span>`;
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
  const cellWidth = Math.floor((availableWidth - totalGapX) / maxCol);
  const maxHeight = Math.floor((availableHeight - totalGapY) / maxRow);
  const cellHeight = Math.min(Math.floor(cellWidth * HEIGHT_RATIO), maxHeight);

  grid.style.gridTemplateColumns = `repeat(${maxCol}, ${cellWidth}px)`;
  grid.style.gridTemplateRows = `repeat(${maxRow}, ${cellHeight}px)`;
  grid.style.width = `${cellWidth * maxCol + totalGapX}px`;
  grid.style.height = `${cellHeight * maxRow + totalGapY}px`;

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const isOccupied = (data.uzimt || '').toLowerCase().includes('užim');
    const isClean = (data.galutine || '').startsWith('🟩');
    const statusClass = isOccupied ? 'occupied' : (isClean ? 'clean' : 'dirty');

    return `<div class="bed-cell ${statusClass}" style="grid-row:${bed.row};grid-column:${bed.col}">
        <div class="bed-id">${bed.id}</div>
        <div class="bed-info">
          ${pillForOccupancy(data.uzimt)}
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
      const prefix = navigator.onLine ? 'Atnaujinta: ' : 'Offline, rodoma talpykla: ';
      updatedEl.textContent = prefix + new Date().toLocaleTimeString('lt-LT');
    }
  } catch (err) {
    console.error('Nepavyko įkelti duomenų', err);
    if (errorEl) {
      errorEl.textContent = 'Nepavyko įkelti duomenų';
      errorEl.classList.remove('hidden');
    }
  }
}

document.getElementById('refreshBtn')?.addEventListener('click', refresh);

refresh();
setInterval(refresh, 30000);

if (container) {
  const ro = new ResizeObserver(() => {
    if (lastRows.length) renderGrid(lastRows);
  });
  ro.observe(container);
}
