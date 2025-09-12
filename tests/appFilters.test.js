// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyFilters } from '../app.js';

const sampleRows = [
  { lova: 'A1', galutine: '🧹 Reikia sutvarkyti', sla: '⛔ Viršyta', uzimt: '', pask: '', who: '', gHoursNum: 0 },
  { lova: 'B1', galutine: '🚫 Užimta', sla: '⚪ Laukia (≤ SLA)', uzimt: '', pask: '', who: '', gHoursNum: 0 },
  { lova: 'C1', galutine: '🟩 Sutvarkyta', sla: '✅ Atlikta laiku', uzimt: '', pask: '', who: '', gHoursNum: 0 }
];

function setupDom() {
  document.body.innerHTML = `
    <input id="search" value="" />
    <select id="filterStatus"><option value=""></option><option value="🧹">🧹</option></select>
    <select id="filterSLA"><option value=""></option><option value="⛔ Viršyta">⛔ Viršyta</option></select>
  `;
}

describe('applyFilters', () => {
  beforeEach(() => {
    setupDom();
  });

  it('filters by status', () => {
    document.getElementById('filterStatus').value = '🧹';
    const res = applyFilters(sampleRows);
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('A1');
  });

  it('filters by SLA', () => {
    document.getElementById('filterSLA').value = '⛔ Viršyta';
    const res = applyFilters(sampleRows);
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('A1');
  });

  it('filters by search query', () => {
    document.getElementById('search').value = 'c1';
    const res = applyFilters(sampleRows);
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('C1');
  });
});
