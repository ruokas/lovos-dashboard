/**
 * Grąžina HTML ženkliuką lovos užimtumo indikacijai.
 * @param {string} s - Tekstas apie užimtumą (pvz., "Užimta", "Laisva").
 * @returns {string} HTML span elementas su atitinkamomis klasėmis.
 */
export function pillForOccupancy(s) {
  if (!s) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  const raw = s.toString().trim();
  const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
  const t = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (t.includes('🟥') || t.includes('uzim') || t.includes('occupied') || t.includes('pacient')) {
    return `<span class="badge bg-rose-100 text-rose-800">${raw}</span>`;
  }
  if (t.includes('🟩') || t.includes('laisv') || t.includes('free') || t.includes('sutvark') || t.includes('clean')) {
    return `<span class="badge bg-emerald-100 text-emerald-800">${raw}</span>`;
  }
  if (t.includes('🟨') || t.includes('ruos') || t.includes('valom') || t.includes('cleaning')) {
    return `<span class="badge bg-amber-100 text-amber-700">${raw}</span>`;
  }
  return `<span class="badge bg-slate-100 text-slate-700">${raw}</span>`;
}
