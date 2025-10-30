import { describe, it, expect, beforeEach } from 'vitest';
import { applyFontSizeClasses, storeFontSizeLevel, readStoredFontSizeLevel, clampFontSizeLevel, FONT_SIZE_STORAGE_KEY, MIN_FONT_SIZE_LEVEL, MAX_FONT_SIZE_LEVEL } from '../utils/fontSize.js';

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }
}

describe('Font size utilities', () => {
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('clamps font size levels within allowed bounds', () => {
    expect(clampFontSizeLevel(-5)).toBe(MIN_FONT_SIZE_LEVEL);
    expect(clampFontSizeLevel(2.6)).toBe(3);
    expect(clampFontSizeLevel(MAX_FONT_SIZE_LEVEL + 50)).toBe(MAX_FONT_SIZE_LEVEL);
  });

  it('applies font size classes proportionally', () => {
    expect(applyFontSizeClasses('text-xs font-semibold', 2)).toBe('text-base font-semibold');
    expect(applyFontSizeClasses('text-lg', 3)).toBe('text-3xl');
    expect(applyFontSizeClasses('text-sm text-xs', 1)).toBe('text-base text-sm');
  });

  it('stores and reads font size level from storage', () => {
    const storedLevel = storeFontSizeLevel(MAX_FONT_SIZE_LEVEL + 2, storage);
    expect(storedLevel).toBe(MAX_FONT_SIZE_LEVEL);
    expect(storage.getItem(FONT_SIZE_STORAGE_KEY)).toBe(String(MAX_FONT_SIZE_LEVEL));

    const readLevel = readStoredFontSizeLevel(storage);
    expect(readLevel).toBe(MAX_FONT_SIZE_LEVEL);
  });

  it('returns default level when storage is empty or invalid', () => {
    expect(readStoredFontSizeLevel(storage)).toBe(MIN_FONT_SIZE_LEVEL);
    storage.setItem(FONT_SIZE_STORAGE_KEY, 'invalid');
    expect(readStoredFontSizeLevel(storage)).toBe(MIN_FONT_SIZE_LEVEL);
  });
});
