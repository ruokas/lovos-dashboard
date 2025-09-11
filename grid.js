import { loadData } from './data.js';
import { bedLayout } from './layout.js';

// Atvaizduoja lovų tinklelio būseną
function renderGrid(rows) {
  const grid = document.getElementById('bedGrid');
  if (!grid) return;

  const maxCol = Math.max(...bedLayout.map(b => b.col));
  grid.className = 'grid gap-2';
  grid.style.gridTemplateColumns = 'repeat(' + maxCol + ', minmax(0,1fr))';

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const statusClass = (data.galutine || '').startsWith('🧹') ? 'dirty'
      : (data.galutine || '').startsWith('🚫') ? 'occupied'
      : (data.galutine || '').startsWith('🟩') ? 'clean'
      : 'bg-slate-100 text-slate-800';

    return `<div class="bed-cell p-2 ${statusClass}" style="grid-row:${bed.row};grid-column:${bed.col}">
      <div class="text-center">
        <div class="font-semibold">${bed.id}</div>
        <div class="text-sm">${data.uzimt || '—'}</div>
      </div>
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
