import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPersistenceManager } from '../persistence/dataPersistenceManager.js';
import { STATUS_OPTIONS } from '../models/bedData.js';

vi.mock('../persistence/syncMetadataService.js', () => ({
  getLastSupabaseUpdate: vi.fn(async () => '2024-01-02T12:00:00.000Z'),
}));

function createLocalStorageMock() {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

function createSupabaseMock() {
  const bedsSelect = vi.fn(async () => ({
    data: [
      { id: 'bed-uuid-1', label: 'IT1' },
    ],
    error: null,
  }));

  const statusInsertSelect = vi.fn(async () => ({
    data: [
      { id: 'status-1', created_at: '2024-01-01T10:00:00.000Z' },
    ],
    error: null,
  }));
  const statusInsert = vi.fn((payload) => {
    return { select: statusInsertSelect };
  });

  const statusSelectOrder = vi.fn(async () => ({
    data: [
      {
        id: 'status-1',
        bed_id: 'bed-uuid-1',
        status: STATUS_OPTIONS.MESSY_BED,
        priority: 1,
        notes: 'Pastaba',
        reported_by: 'nurse@example.com',
        metadata: { description: 'Pastaba' },
        created_at: '2024-01-01T10:00:00.000Z',
        beds: { label: 'IT1' },
      },
    ],
    error: null,
  }));
  const statusSelect = vi.fn(() => ({ order: statusSelectOrder }));

  const occupancySelectOrder = vi.fn(async () => ({
    data: [
      {
        id: 'occupancy-1',
        bed_id: 'bed-uuid-1',
        occupancy_state: 'occupied',
        patient_code: null,
        expected_until: null,
        notes: null,
        created_by: 'nurse@example.com',
        metadata: {},
        created_at: '2024-01-01T09:00:00.000Z',
        beds: { label: 'IT1' },
      },
    ],
    error: null,
  }));
  const occupancySelect = vi.fn(() => ({ order: occupancySelectOrder }));

  const occupancyInsertSelect = vi.fn(async () => ({
    data: [
      { id: 'occupancy-1', created_at: '2024-01-01T09:00:00.000Z' },
    ],
    error: null,
  }));
  const occupancyInsert = vi.fn(() => ({ select: occupancyInsertSelect }));

  const aggregatedSelect = vi.fn(async () => ({
    data: [
      {
        bed_id: 'bed-uuid-1',
        label: 'IT1',
        status: STATUS_OPTIONS.MESSY_BED,
        priority: 2,
        status_notes: 'Pastaba',
        status_reported_by: 'nurse@example.com',
        status_metadata: { description: 'Pastaba' },
        status_created_at: '2024-01-01T10:00:00.000Z',
        occupancy_state: 'occupied',
        patient_code: 'P123',
        expected_until: '2024-01-01T12:00:00.000Z',
        occupancy_notes: null,
        occupancy_created_by: 'nurse@example.com',
        occupancy_metadata: {},
        occupancy_created_at: '2024-01-01T09:00:00.000Z',
      },
    ],
    error: null,
  }));

  const deleteBuilder = { neq: vi.fn(async () => ({ error: null })) };

  const from = vi.fn((table) => {
    switch (table) {
      case 'beds':
        return { select: bedsSelect };
      case 'bed_status_events':
        return {
          insert: statusInsert,
          select: statusSelect,
          delete: () => deleteBuilder,
        };
      case 'occupancy_events':
        return {
          insert: occupancyInsert,
          select: occupancySelect,
          delete: () => deleteBuilder,
        };
      case 'aggregated_bed_state':
        return {
          select: aggregatedSelect,
        };
      default:
        throw new Error(`Unknown table mock requested: ${table}`);
    }
  });

  return {
    from,
    __mocks: {
      bedsSelect,
      statusInsert,
      statusInsertSelect,
      statusSelectOrder,
      occupancyInsert,
      occupancyInsertSelect,
      occupancySelectOrder,
      aggregatedSelect,
    },
  };
}

describe('DataPersistenceManager with Supabase', () => {
  let supabaseMock;
  let manager;

  beforeEach(() => {
    supabaseMock = createSupabaseMock();
    manager = new DataPersistenceManager({ client: supabaseMock });
  });

  it('išsaugo lovos būseną per Supabase', async () => {
    const payload = {
      timestamp: '2024-01-01T10:00:00.000Z',
      email: 'nurse@example.com',
      bedId: 'IT1',
      status: STATUS_OPTIONS.MESSY_BED,
      description: 'Pastaba',
    };

    await manager.saveFormResponse(payload);

    expect(supabaseMock.__mocks.statusInsert).toHaveBeenCalledTimes(1);
    const [records] = supabaseMock.__mocks.statusInsert.mock.calls[0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      bed_id: 'bed-uuid-1',
      status: STATUS_OPTIONS.MESSY_BED,
      notes: 'Pastaba',
      reported_by: 'nurse@example.com',
      created_at: '2024-01-01T10:00:00.000Z',
    });
  });

  it('grąžina suvienodintus įrašus iš Supabase', async () => {
    const formResponses = await manager.loadFormResponses();
    const occupancy = await manager.loadOccupancyData();

    expect(formResponses).toEqual([
      {
        id: 'status-1',
        timestamp: '2024-01-01T10:00:00.000Z',
        email: 'nurse@example.com',
        bedId: 'IT1',
        status: STATUS_OPTIONS.MESSY_BED,
        description: 'Pastaba',
        priority: 1,
        metadata: { description: 'Pastaba' },
      },
    ]);

    expect(occupancy).toEqual([
      {
        id: 'occupancy-1',
        timestamp: '2024-01-01T09:00:00.000Z',
        bedId: 'IT1',
        status: 'occupied',
        patientCode: null,
        expectedUntil: null,
        notes: null,
        createdBy: 'nurse@example.com',
        metadata: {},
      },
    ]);
  });

  it('nuskaito suvestinius duomenis iš Supabase', async () => {
    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(1);
    expect(aggregated).toEqual([
      {
        bedId: 'IT1',
        bedUuid: 'bed-uuid-1',
        status: STATUS_OPTIONS.MESSY_BED,
        statusNotes: 'Pastaba',
        priority: 2,
        statusReportedBy: 'nurse@example.com',
        statusCreatedAt: '2024-01-01T10:00:00.000Z',
        statusMetadata: { description: 'Pastaba' },
        occupancyState: 'occupied',
        patientCode: 'P123',
        expectedUntil: '2024-01-01T12:00:00.000Z',
        occupancyNotes: null,
        occupancyCreatedBy: 'nurse@example.com',
        occupancyCreatedAt: '2024-01-01T09:00:00.000Z',
        occupancyMetadata: {},
      },
    ]);
    expect(manager.lastSyncCache).toBe('2024-01-01T10:00:00.000Z');
  });

  it('meta aiškią klaidą, kai Supabase grąžina klaidą įrašant', async () => {
    const errorClient = {
      from: vi.fn((table) => {
        if (table === 'beds') {
          return {
            select: vi.fn(async () => ({ data: [{ id: 'bed-uuid-1', label: 'IT1' }], error: null })),
          };
        }
        if (table === 'bed_status_events') {
          return {
            insert: () => ({
              select: async () => ({ data: null, error: { message: 'Insert failed' } }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const errorManager = new DataPersistenceManager({ client: errorClient });

    await expect(
      errorManager.saveFormResponse({
        timestamp: '2024-01-01T10:00:00.000Z',
        email: 'nurse@example.com',
        bedId: 'IT1',
        status: STATUS_OPTIONS.MESSY_BED,
        description: 'Pastaba',
      }),
    ).rejects.toThrow('Nepavyko išsaugoti lovos būsenos Supabase: Insert failed');
  });
});

describe('DataPersistenceManager local režime', () => {
  let manager;

  beforeEach(() => {
    global.localStorage = createLocalStorageMock();
    manager = new DataPersistenceManager();
  });

  afterEach(() => {
    if (global.localStorage?.clear) {
      global.localStorage.clear();
    }
    delete global.localStorage;
  });

  it('grąžina suvestinius duomenis iš localStorage', async () => {
    const statusTimestamp = '2024-01-03T08:00:00.000Z';
    const occupancyTimestamp = '2024-01-03T07:00:00.000Z';

    global.localStorage.setItem(
      'bed-management-form-responses',
      JSON.stringify([
        {
          bedId: 'IT1',
          status: STATUS_OPTIONS.CLEAN,
          timestamp: '2024-01-01T00:00:00.000Z',
          email: 'old@example.com',
        },
        {
          bedId: 'IT1',
          status: STATUS_OPTIONS.MISSING_EQUIPMENT,
          timestamp: statusTimestamp,
          description: 'Trūksta lašelinės',
          email: 'nurse@example.com',
          metadata: { description: 'Trūksta lašelinės' },
        },
      ]),
    );

    global.localStorage.setItem(
      'bed-management-occupancy-data',
      JSON.stringify([
        {
          bedId: 'IT1',
          status: 'occupied',
          timestamp: occupancyTimestamp,
          createdBy: 'porter@example.com',
        },
      ]),
    );

    const aggregated = await manager.loadAggregatedBedState();
    const target = aggregated.find((item) => item.bedId === 'IT1');

    expect(target).toBeDefined();
    expect(target.status).toBe(STATUS_OPTIONS.MISSING_EQUIPMENT);
    expect(target.statusNotes).toBe('Trūksta lašelinės');
    expect(target.statusCreatedAt).toBe(statusTimestamp);
    expect(target.occupancyState).toBe('occupied');
    expect(target.occupancyCreatedAt).toBe(occupancyTimestamp);
    expect(manager.lastSyncCache).toBe(statusTimestamp);
    expect(global.localStorage.getItem('bed-management-last-sync')).toBe(statusTimestamp);
  });
});
