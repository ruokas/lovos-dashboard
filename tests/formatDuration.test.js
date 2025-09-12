import { describe, it, expect } from 'vitest';
import { formatDuration } from '../app.js';

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(1.5)).toBe('1 val 30 min');
  });

  it('handles whole hours', () => {
    expect(formatDuration(2)).toBe('2 val');
  });

  it('returns empty string for invalid input', () => {
    expect(formatDuration(-1)).toBe('');
  });
});
