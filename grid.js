import { loadData } from './data.js';
import { bedLayout } from './layout.js';

let lastRows = [];

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

// Atvaizduoja lovų tinklelio būseną
function renderGrid(rows) {
  lastRows = rows;
  const grid = document.getElementById('bedGrid');
  if (!grid) return;

  const maxCol = Math.max(...bedLayout.map(b => b.col));
  const maxRow = Math.max(...bedLayout.map(b => b.row));

  // The immediate parent height collapses before the grid is sized,
  // causing cellSize to calculate as 0 and cells to overlap.
  // Measure width from the parent but take height from the grandparent
  // (which stretches to fill the available space) with fallbacks.
  const parent = grid.parentElement;
  const container = parent.parentElement;
  const availableWidth = parent.clientWidth;
  const availableHeight = container?.clientHeight || parent.clientHeight || window.innerHeight;

  const styles = getComputedStyle(grid);
  const gapX = parseFloat(styles.columnGap || styles.gap) || 0;
  const gapY = parseFloat(styles.rowGap || styles.gap) || 0;

  const totalGapX = gapX * (maxCol - 1);
  const totalGapY = gapY * (maxRow - 1);

  const cellSize = Math.floor(
    Math.min(
      (availableWidth - totalGapX) / maxCol,
      (availableHeight - totalGapY) / maxRow
    )
  );

  grid.className = 'grid gap-2';
  grid.style.gridTemplateColumns = `repeat(${maxCol}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(${maxRow}, ${cellSize}px)`;
  grid.style.width = `${cellSize * maxCol + totalGapX}px`;
  grid.style.height = `${cellSize * maxRow + totalGapY}px`;

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const statusClass = (data.galutine || '').startsWith('🧹') ? 'dirty'
      : (data.galutine || '').startsWith('🚫') ? 'occupied'
      : (data.galutine || '').startsWith('🟩') ? 'clean'
      : 'bg-slate-100 text-slate-800';

    return `<div class="bed-cell ${statusClass}" style="grid-row:${bed.row} / span 1;grid-column:${bed.col} / span 1">
      <div class="bed-id">${bed.id}</div>
      <div class="bed-info flex flex-col items-center gap-1">${pillForOccupancy(data.uzimt)}${pillForStatus(data.galutine)}</div>
    </div>`;
  }).join('');
}

// Įkelia duomenis ir atnaujina tinklelio vaizdą
async function refresh() {
  try {
    const rows = await loadData();
    renderGrid(rows);
  } catch (err) {
    console.error('Nepavyko įkelti duomenų', err);
    const el = document.getElementById('error');
    if (el) {
      el.textContent = 'Nepavyko įkelti duomenų';
      el.classList.remove('hidden');
    }
  }
}

// Pradinis paleidimas ir periodinis atnaujinimas kas 10 s
refresh();
setInterval(refresh, 10000);

window.addEventListener('resize', () => {
  if (lastRows.length) renderGrid(lastRows);
});
