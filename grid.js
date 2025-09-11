import { loadData } from './data.js';

// Lovų pozicijų koordinatės (pridėkite daugiau pagal poreikį)
export const bedLayout = [
  { id: 'A1', row: 1, col: 1 },
  { id: 'A2', row: 1, col: 2 },
  { id: 'A3', row: 1, col: 3 },
  { id: 'B1', row: 2, col: 1 },
  { id: 'B2', row: 2, col: 2 },
  { id: 'B3', row: 2, col: 3 }
];

// Atvaizduoja lovų tinklelio būseną
function renderGrid(rows) {
  const grid = document.getElementById('bedGrid');
  if (!grid) return;

  const maxCol = Math.max(...bedLayout.map(b => b.col));
  grid.className = `grid gap-2 grid-cols-${maxCol}`;

  grid.innerHTML = bedLayout.map(bed => {
    const data = rows.find(r => (r.lova || '').toLowerCase() === bed.id.toLowerCase()) || {};
    const color = (data.galutine || '').startsWith('🧹') ? 'bg-orange-100 text-orange-800'
      : (data.galutine || '').startsWith('🚫') ? 'bg-rose-100 text-rose-800'
      : (data.galutine || '').startsWith('🟩') ? 'bg-emerald-100 text-emerald-800'
      : 'bg-slate-100 text-slate-800';

    return `<div class="p-2 text-center rounded ${color}" style="grid-row:${bed.row};grid-column:${bed.col}">
      <div class="font-semibold">${bed.id}</div>
      <div class="text-sm">${data.uzimt || '—'}</div>
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
  }
}

// Pradinis paleidimas ir periodinis atnaujinimas kas 10 s
refresh();
setInterval(refresh, 10000);
