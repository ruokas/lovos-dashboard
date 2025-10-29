import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadData } from '../data.js';

const createLocalStorageMock = () => {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    __store: store,
  };
};

describe('loadData', () => {
  let fetchMock;
  let papaParseMock;
  let localStorageMock;
  let consoleErrorSpy;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    localStorageMock = createLocalStorageMock();
    globalThis.localStorage = localStorageMock;

    papaParseMock = vi.fn();
    globalThis.Papa = { parse: papaParseMock };

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.fetch;
    delete globalThis.Papa;
    delete globalThis.localStorage;
  });

  it('grąžina normalizuotas eilutes kai CSV sėkmingai įkeltas', async () => {
    const csvText = 'mock csv';
    const response = { text: vi.fn().mockResolvedValue(csvText) };
    fetchMock.mockResolvedValue(response);

    const rawRows = [
      {
        'Lova': 'A1',
        'Būsena': '🧹 Tvarkyti',
        'Kontrolė': '⛔ Viršyta',
        'Užimtumas': 'Užimta',
        'Atlaisvinta prieš': '1,5',
        'Paskutinė būsena': 'Pastaba',
        'Pažymėjo': 'Jonas',
      },
    ];

    papaParseMock.mockImplementation((csv, options) => {
      options.complete({ data: rawRows });
    });

    const rows = await loadData();

    const expectedRows = [
      {
        order: 0,
        lova: 'A1',
        galutine: '🧹 Tvarkyti',
        sla: '⛔ Viršyta',
        uzimt: 'Užimta',
        gHours: '1,5',
        gHoursNum: 1.5,
        pask: 'Pastaba',
        who: 'Jonas',
        bedId: '1',
        bedKey: '1',
      },
    ];

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('docs.google.com'), { cache: 'no-store' });
    expect(response.text).toHaveBeenCalledTimes(1);
    expect(papaParseMock).toHaveBeenCalledWith(csvText, expect.objectContaining({ header: true, skipEmptyLines: true }));
    expect(rows).toEqual(expectedRows);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('cachedRows', JSON.stringify(expectedRows));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('grąžina talpyklos duomenis kai fetch meta klaidą', async () => {
    const cachedRows = [
      {
        order: 3,
        lova: 'B2',
        galutine: '🚫 Užimta',
        sla: '⚠️ Ką tik atlaisvinta',
        uzimt: 'Ligonis',
        gHours: '0,5',
        gHoursNum: 0.5,
        pask: 'Laukiame',
        who: 'Asta',
        bedId: '2',
        bedKey: '2',
      },
    ];

    localStorageMock.__store.set('cachedRows', JSON.stringify(cachedRows));
    fetchMock.mockRejectedValue(new Error('Network klaida'));

    const rows = await loadData();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorageMock.getItem).toHaveBeenCalledWith('cachedRows');
    expect(rows).toEqual(cachedRows);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
