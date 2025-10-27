const FONT_SIZE_CLASSES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];

export const FONT_SIZE_STORAGE_KEY = 'notificationFontSize';
export const MIN_FONT_SIZE_LEVEL = 0;
export const MAX_FONT_SIZE_LEVEL = 3;

function getDefaultStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return undefined;
}

export function clampFontSizeLevel(level) {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return MIN_FONT_SIZE_LEVEL;
  }
  return Math.min(Math.max(Math.round(level), MIN_FONT_SIZE_LEVEL), MAX_FONT_SIZE_LEVEL);
}

export function readStoredFontSizeLevel(storage = getDefaultStorage()) {
  try {
    const raw = storage?.getItem?.(FONT_SIZE_STORAGE_KEY);
    if (raw === null || raw === undefined) {
      return MIN_FONT_SIZE_LEVEL;
    }
    const parsed = Number.parseInt(String(raw), 10);
    return clampFontSizeLevel(Number.isNaN(parsed) ? MIN_FONT_SIZE_LEVEL : parsed);
  } catch (error) {
    console.warn('Nepavyko nuskaityti pranešimų šrifto dydžio iš localStorage:', error);
    return MIN_FONT_SIZE_LEVEL;
  }
}

export function storeFontSizeLevel(level, storage = getDefaultStorage()) {
  const clamped = clampFontSizeLevel(level);
  try {
    storage?.setItem?.(FONT_SIZE_STORAGE_KEY, String(clamped));
  } catch (error) {
    console.warn('Nepavyko išsaugoti pranešimų šrifto dydžio į localStorage:', error);
  }
  return clamped;
}

export function applyFontSizeClasses(classNames, level) {
  if (!classNames) {
    return classNames;
  }
  const clamped = clampFontSizeLevel(level);
  const tokens = String(classNames)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const index = FONT_SIZE_CLASSES.indexOf(token);
      if (index === -1) {
        return token;
      }
      const targetIndex = Math.min(index + clamped, FONT_SIZE_CLASSES.length - 1);
      return FONT_SIZE_CLASSES[targetIndex];
    });
  return tokens.join(' ');
}
