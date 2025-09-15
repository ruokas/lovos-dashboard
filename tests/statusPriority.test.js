import { describe, it, expect } from 'vitest';
import { statusPriority } from '../app.js';

describe('statusPriority', () => {
  it('grąžina 0 už 🧹 statusą (su tarpais pradžioje)', () => {
    expect(statusPriority('   🧹 Tvarkyti')).toBe(0);
  });

  it('grąžina 1 už 🚫 statusą', () => {
    expect(statusPriority('🚫 Užimta')).toBe(1);
  });

  it('grąžina 2 už 🟩 statusą', () => {
    expect(statusPriority('🟩 Laisva')).toBe(2);
  });

  it('grąžina 9 už nežinomą ikoną', () => {
    expect(statusPriority('⚠️ Laukia')).toBe(9);
  });

  it('grąžina 99 kai statusas neapibrėžtas', () => {
    expect(statusPriority(null)).toBe(99);
    expect(statusPriority('')).toBe(99);
  });
});
