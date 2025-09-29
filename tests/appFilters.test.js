import { describe, it, expect } from 'vitest';
import { applyFilters } from '../app.js';

const sampleRows = [
  { lova: 'A1', galutine: '🧹 Reikia sutvarkyti', sla: '⛔ Viršyta', uzimt: '', pask: '', who: '', gHoursNum: 0 },
  { lova: 'B1', galutine: '🚫 Užimta', sla: '⚪ Laukia (≤ SLA)', uzimt: '', pask: '', who: '', gHoursNum: 0 },
  { lova: 'C1', galutine: '🟩 Sutvarkyta', sla: '✅ Atlikta laiku', uzimt: '', pask: '', who: '', gHoursNum: 0 }
];

describe('applyFilters', () => {
  it('filters by status', () => {
    const res = applyFilters(sampleRows, { status: '🧹' });
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('A1');
  });

  it('filters by SLA', () => {
    const res = applyFilters(sampleRows, { sla: '⛔ Viršyta' });
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('A1');
  });

  it('filters by search query', () => {
    const res = applyFilters(sampleRows, { query: 'c1' });
    expect(res).toHaveLength(1);
    expect(res[0].lova).toBe('C1');
  });
});
