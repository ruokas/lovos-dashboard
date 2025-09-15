/**
 * Grąžina HTML ženkliuką lovos užimtumo indikacijai.
 * @param {string} s - Tekstas apie užimtumą (pvz., "Užimta", "Laisva").
 * @returns {string} HTML span elementas su atitinkamomis klasėmis.
 */
export function pillForOccupancy(s) {
  if (!s) return `<span class="badge bg-slate-100 text-slate-700">—</span>`;
  const t = s.trim().toLowerCase();
  if (t.includes("užim")) return `<span class="badge bg-rose-100 text-rose-800">${s}</span>`;
  if (t.includes("laisv")) return `<span class="badge bg-emerald-100 text-emerald-800">${s}</span>`;
  return `<span class="badge bg-slate-100 text-slate-700">${s}</span>`;
}
