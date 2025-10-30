import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadData, parseTimestampToMillis, interpretOccupancyState, rowsToOccupancyEvents, latestRowsByBed } from '../data.js';

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
    const response = {
      ok: true,
      headers: { get: vi.fn().mockReturnValue('text/csv') },
      text: vi.fn().mockResolvedValue(csvText),
    };
    fetchMock.mockResolvedValue(response);

    const timestamp = '2024-10-10 15:30:00';
    const rawRows = [
      {
        'Timestamp': timestamp,
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
        timestamp,
        timestampMs: parseTimestampToMillis(timestamp),
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
    const cachedTimestamp = '2024-10-11 08:00:00';
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
        timestamp: cachedTimestamp,
        timestampMs: parseTimestampToMillis(cachedTimestamp),
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

describe('CSV helper utilities', () => {
  it('interpretOccupancyState klasifikuoja būsenas', () => {
    expect(interpretOccupancyState('Užimta')).toBe('occupied');
    expect(interpretOccupancyState('laisva')).toBe('free');
    expect(interpretOccupancyState('Valoma')).toBe('cleaning');
    expect(interpretOccupancyState('nežinoma')).toBe('unknown');
  });

  it('latestRowsByBed parenka naujausią įrašą pagal timestamp', () => {
    const rows = [
      { bedId: '1', bedKey: '1', timestamp: '2024-10-10 10:00:00', timestampMs: parseTimestampToMillis('2024-10-10 10:00:00'), order: 0 },
      { bedId: '1', bedKey: '1', timestamp: '2024-10-10 12:00:00', timestampMs: parseTimestampToMillis('2024-10-10 12:00:00'), order: 1 },
      { bedId: '2', bedKey: '2', timestamp: '', timestampMs: null, order: 0 },
      { bedId: '2', bedKey: '2', timestamp: '', timestampMs: null, order: 5 },
    ];

    const latest = latestRowsByBed(rows);
    expect(latest.get('1').timestamp).toBe('2024-10-10 12:00:00');
    expect(latest.get('2').order).toBe(5);
  });

  it('rowsToOccupancyEvents konvertuoja CSV įvykius į occupancy įrašus', () => {
    const rows = [
      {
        bedId: '1',
        bedKey: '1',
        uzimt: 'Užimta',
        timestamp: '2024-10-10 12:00:00',
        timestampMs: parseTimestampToMillis('2024-10-10 12:00:00'),
        order: 0,
      },
      {
        bedId: '2',
        bedKey: '2',
        uzimt: 'Valoma',
        timestamp: '2024-10-10 11:00:00',
        timestampMs: parseTimestampToMillis('2024-10-10 11:00:00'),
        order: 1,
      },
    ];

    const events = rowsToOccupancyEvents(rows);
    expect(events).toHaveLength(2);
    const occupied = events.find(e => e.bedId === '1');
    const cleaning = events.find(e => e.bedId === '2');
    expect(occupied.status).toBe('occupied');
    expect(cleaning.status).toBe('free');
    expect(cleaning.metadata?.csvStatus).toBe('Valoma');
  });
});
