import { loadData } from './data.js';
import { bedLayout } from './layout.js';

let lastRows = [];
const grid = document.getElementById('bedGrid');
const container = grid?.parentElement?.parentElement;

function pillForOccupancy(s) {
  if (!s) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  const t = s.trim().toLowerCase();
  if (t.includes('užim')) return `<span class="badge bg-rose-100 text-rose-800">${s}</span>`;
  if (t.includes('laisv')) return `<span class="badge bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s}</span>`;
}

function pillForStatus(s) {
  if (!s) return `<span class="status-pill bg-slate-200 text-slate-700">—</span>`;
  const icon = s.trim().charAt(0);
  if (icon === '🧹') return `<span class="status-pill bg-orange-100 text-orange-800">${s}</span>`;
  if (icon === '🚫') return `<span class="status-pill bg-rose-100 text-rose-800">${s}</span>`;
  if (icon === '🟩') return `<span class="status-pill bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="status-pill bg-slate-100 text-slate-700">${s}</span>`;
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

  const cellSize = Math.floor(Math.min(
    (availableWidth - totalGapX) / maxCol,
    (availableHeight - totalGapY) / maxRow
  ));

  grid.style.gridTemplateColumns = `repeat(${maxCol}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(${maxRow}, ${cellSize}px)`;
  grid.style.width = `${cellSize * maxCol + totalGapX}px`;
  grid.style.height = `${cellSize * maxRow + totalGapY}px`;

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const statusClass = (data.galutine || '').startsWith('🧹')
      ? 'dirty'
      : (data.galutine || '').startsWith('🚫')
        ? 'occupied'
        : (data.galutine || '').startsWith('🟩')
          ? 'clean'
          : 'bg-slate-100 text-slate-800';

    return `<div class="bed-cell ${statusClass}" style="grid-row:${bed.row};grid-column:${bed.col}">
        <div class="bed-id">${bed.id}</div>
        <div class="bed-info">
          ${pillForOccupancy(data.uzimt)}
          ${pillForStatus(data.galutine)}
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
    if (updatedEl) updatedEl.textContent = new Date().toLocaleTimeString('lt-LT');
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
