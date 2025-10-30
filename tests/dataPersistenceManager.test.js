import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPersistenceManager } from '../persistence/dataPersistenceManager.js';
import { STATUS_OPTIONS } from '../models/bedData.js';

vi.mock('../persistence/syncMetadataService.js', () => ({
  getLastSupabaseUpdate: vi.fn(async () => '2024-01-02T12:00:00.000Z'),
}));

vi.mock('../persistence/supabaseClient.js', () => ({
  getSupabaseClient: vi.fn(() => null),
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
        vieta: 'IT1',
        busena: 'Užimta',
        pacientas: 'P123',
        komentaras: 'Pastaba',
        slaugytojas: 'nurse@example.com',
        padejejas: 'assistant@example.com',
        gydytojas: null,
        kat: 2,
        occupancy: true,
        updated_at: '2024-01-01T09:00:00.000Z',
      },
    ],
    error: null,
  }));
  const occupancySelect = vi.fn(() => ({ order: occupancySelectOrder }));

  const boardUpsertSelect = vi.fn(async () => ({
    data: [
      { vieta: 'IT1', updated_at: '2024-01-01T09:00:00.000Z' },
    ],
    error: null,
  }));
  const boardUpsert = vi.fn(() => ({ select: boardUpsertSelect }));

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
        occupancy_state: 'Užimta',
        patient_code: 'P123',
        expected_until: null,
        occupancy_notes: 'Pastaba',
        occupancy_created_by: 'nurse@example.com',
        occupancy_metadata: { nurse: 'nurse@example.com' },
        occupancy: true,
        occupancy_created_at: '2024-01-01T09:00:00.000Z',
      },
    ],
    error: null,
  }));

  const statusDeleteBuilder = { neq: vi.fn(async () => ({ error: null })) };
  const boardDeleteBuilder = { select: vi.fn(async () => ({ error: null })) };

  const from = vi.fn((table) => {
    switch (table) {
      case 'beds':
        return { select: bedsSelect };
      case 'bed_status_events':
        return {
          insert: statusInsert,
          select: statusSelect,
          delete: () => statusDeleteBuilder,
        };
      case 'ed_board':
        return {
          upsert: boardUpsert,
          select: occupancySelect,
          delete: () => boardDeleteBuilder,
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
      boardUpsert,
      boardUpsertSelect,
      occupancySelectOrder,
      statusDeleteBuilder,
      boardDeleteBuilder,
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

  it('saugodamas užimtumą nustato occupancy lauką pagal paciento reikšmę, jei statusas nepateiktas', async () => {
    await manager.saveOccupancyData({
      bedId: 'IT1',
      patientCode: 'PX1',
      notes: 'Pacientas įvestas ranka',
      timestamp: '2024-01-01T11:30:00.000Z',
    });

    expect(supabaseMock.__mocks.boardUpsert).toHaveBeenCalledTimes(1);
    const [records] = supabaseMock.__mocks.boardUpsert.mock.calls[0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      vieta: 'IT1',
      pacientas: 'PX1',
      busena: 'Užimta',
      occupancy: true,
      komentaras: 'Pacientas įvestas ranka',
      updated_at: '2024-01-01T11:30:00.000Z',
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
        patientCode: 'P123',
        occupancy: true,
        expectedUntil: null,
        notes: 'Pastaba',
        createdBy: 'nurse@example.com',
        metadata: {
          source: 'ed_board',
          nurse: 'nurse@example.com',
          assistant: 'assistant@example.com',
          rawStatus: 'Užimta',
          kat: 2,
          occupancy: true,
        },
      },
    ]);
  });

  it('nustato užimtumą pagal occupancy lauką', async () => {
    supabaseMock.__mocks.occupancySelectOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'occupancy-2',
          vieta: 'IT2',
          busena: null,
          pacientas: 'P999',
          komentaras: null,
          slaugytojas: null,
          padejejas: null,
          gydytojas: null,
          kat: null,
          occupancy: true,
          updated_at: '2024-01-01T12:00:00.000Z',
        },
        {
          id: 'occupancy-3',
          vieta: 'IT3',
          busena: '',
          pacientas: '',
          komentaras: 'Be paciento',
          slaugytojas: 'nurse2@example.com',
          padejejas: null,
          gydytojas: null,
          kat: null,
          occupancy: false,
          updated_at: '2024-01-01T13:00:00.000Z',
        },
      ],
      error: null,
    });

    const occupancy = await manager.loadOccupancyData();

    expect(occupancy).toEqual([
      {
        id: 'occupancy-2',
        timestamp: '2024-01-01T12:00:00.000Z',
        bedId: 'IT2',
        status: 'occupied',
        patientCode: 'P999',
        occupancy: true,
        expectedUntil: null,
        notes: null,
        createdBy: null,
        metadata: {
          source: 'ed_board',
          occupancy: true,
        },
      },
      {
        id: 'occupancy-3',
        timestamp: '2024-01-01T13:00:00.000Z',
        bedId: 'IT3',
        status: 'free',
        patientCode: '',
        occupancy: false,
        expectedUntil: null,
        notes: 'Be paciento',
        createdBy: 'nurse2@example.com',
        metadata: {
          source: 'ed_board',
          nurse: 'nurse2@example.com',
          occupancy: false,
        },
      },
    ]);
  });

  it('interpretuoja TRUE/FALSE reikšmes kaip užimtumo būsenas', async () => {
    supabaseMock.__mocks.occupancySelectOrder.mockResolvedValueOnce({
      data: [
        {
          vieta: 'IT1',
          busena: 'TRUE',
          pacientas: '',
          komentaras: null,
          slaugytojas: null,
          padejejas: null,
          gydytojas: null,
          kat: null,
          occupancy: 'true',
          updated_at: '2024-01-02T10:00:00.000Z',
        },
        {
          vieta: 'IT1',
          busena: 'FALSE',
          pacientas: '',
          komentaras: null,
          slaugytojas: null,
          padejejas: null,
          gydytojas: null,
          kat: null,
          occupancy: 'false',
          updated_at: '2024-01-02T12:00:00.000Z',
        },
      ],
      error: null,
    });

    const occupancy = await manager.loadOccupancyData();

    expect(occupancy).toEqual([
      {
        id: 'IT1-2024-01-02T10:00:00.000Z',
        timestamp: '2024-01-02T10:00:00.000Z',
        bedId: 'IT1',
        status: 'occupied',
        patientCode: '',
        occupancy: true,
        expectedUntil: null,
        notes: null,
        createdBy: null,
        metadata: {
          source: 'ed_board',
          occupancy: true,
          rawStatus: 'TRUE',
        },
      },
      {
        id: 'IT1-2024-01-02T12:00:00.000Z',
        timestamp: '2024-01-02T12:00:00.000Z',
        bedId: 'IT1',
        status: 'free',
        patientCode: '',
        occupancy: false,
        expectedUntil: null,
        notes: null,
        createdBy: null,
        metadata: {
          source: 'ed_board',
          occupancy: false,
          rawStatus: 'FALSE',
        },
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
        occupancy: true,
        patientCode: 'P123',
        expectedUntil: null,
        occupancyNotes: 'Pastaba',
        occupancyCreatedBy: 'nurse@example.com',
        occupancyCreatedAt: '2024-01-01T09:00:00.000Z',
        occupancyMetadata: {
          nurse: 'nurse@example.com',
          source: 'ed_board',
          rawStatus: 'Užimta',
          occupancy: true,
        },
      },
    ]);
    expect(manager.lastSyncCache).toBe('2024-01-01T10:00:00.000Z');
  });

  it('agreguotoje suvestinėje būseną nustato pagal occupancy lauką, jei busena tuščia', async () => {
    supabaseMock.__mocks.aggregatedSelect.mockResolvedValueOnce({
      data: [
        {
          bed_id: 'bed-uuid-1',
          label: 'IT1',
          status: null,
          priority: null,
          status_notes: null,
          status_reported_by: null,
          status_metadata: {},
          status_created_at: null,
          occupancy_state: null,
          patient_code: null,
          expected_until: null,
          occupancy_notes: null,
          occupancy_created_by: null,
          occupancy_metadata: null,
          occupancy: true,
          occupancy_created_at: '2024-01-01T14:00:00.000Z',
        },
      ],
      error: null,
    });

    const aggregated = await manager.loadAggregatedBedState();

    expect(aggregated).toEqual([
      {
        bedId: 'IT1',
        bedUuid: 'bed-uuid-1',
        status: null,
        statusNotes: null,
        priority: 0,
        statusReportedBy: null,
        statusCreatedAt: null,
        statusMetadata: {},
        occupancyState: 'occupied',
        occupancy: true,
        patientCode: null,
        expectedUntil: null,
        occupancyNotes: null,
        occupancyCreatedBy: null,
        occupancyCreatedAt: '2024-01-01T14:00:00.000Z',
        occupancyMetadata: {
          source: 'ed_board',
          occupancy: true,
        },
      },
    ]);
  });

  it('naudoja occupancy_flag alias, jei pagrindinis occupancy stulpelis dar nesukurtas', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: null,
            priority: null,
            status_notes: null,
            status_reported_by: null,
            status_metadata: {},
            status_created_at: null,
            occupancy_state: null,
            patient_code: 'P555',
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: null,
            occupancy_metadata: null,
            occupancy_flag: true,
            occupancy_created_at: '2024-01-01T14:00:00.000Z',
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(2);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[0][0]).toContain('occupancy');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('occupancy_flag');
    expect(aggregated).toEqual([
      expect.objectContaining({
        bedId: 'IT1',
        occupancy: true,
        occupancyMetadata: expect.objectContaining({
          occupancy: true,
        }),
      }),
    ]);

    warnSpy.mockRestore();
  });

  it('prisitaiko prie is_occupied alias, jei abu occupancy stulpeliai nepasiekiami', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy_flag does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: null,
            priority: null,
            status_notes: null,
            status_reported_by: null,
            status_metadata: {},
            status_created_at: null,
            occupancy_state: null,
            patient_code: null,
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: null,
            occupancy_metadata: null,
            is_occupied: false,
            occupancy_created_at: '2024-01-01T14:00:00.000Z',
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(3);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('occupancy_flag');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[2][0]).toContain('is_occupied');
    expect(aggregated).toEqual([
      expect.objectContaining({
        bedId: 'IT1',
        occupancy: false,
        occupancyState: 'free',
      }),
    ]);

    warnSpy.mockRestore();
  });

  it('prisitaiko prie senesnės aggregated_bed_state schemos be status_reported_by', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.status_reported_by does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: STATUS_OPTIONS.CLEAN,
            priority: null,
            status_notes: null,
            status_reported_by: 'legacy@example.com',
            status_metadata: {},
            status_created_at: '2024-01-01T08:00:00.000Z',
            occupancy_state: null,
            patient_code: null,
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: null,
            occupancy_metadata: {},
            occupancy_created_at: null,
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(2);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[0][0]).toContain('status_reported_by');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('status_reported_by:reported_by');
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].statusReportedBy).toBe('legacy@example.com');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('aggregated_bed_state view neturi stulpelio status_reported_by'),
    );

    warnSpy.mockRestore();
  });

  it('toliau veikia, jei senesnėje schemoje nėra metadata stulpelių', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.status_metadata does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy_metadata does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: STATUS_OPTIONS.CLEAN,
            priority: null,
            status_notes: null,
            status_reported_by: 'legacy@example.com',
            status_created_at: '2024-01-01T08:00:00.000Z',
            occupancy_state: null,
            patient_code: null,
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: null,
            occupancy_created_at: null,
            occupancy_metadata: { legacy: true },
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(3);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[0][0]).toContain('status_metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).not.toContain('status_metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('occupancy_metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[2][0]).not.toContain('status_metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[2][0]).toContain('occupancy_metadata:metadata');
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].statusMetadata).toEqual({});
    expect(aggregated[0].occupancyMetadata).toEqual({ legacy: true, source: 'ed_board' });
    expect(
      warnSpy.mock.calls.some(([message]) =>
        message.includes('status_metadata') && message.includes('tęsiama be šios informacijos'),
      ),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) =>
        message.includes('occupancy_metadata') && message.includes('mėginamas suderinamumo alias'),
      ),
    ).toBe(true);
    expect(
      infoSpy.mock.calls.some(([message]) =>
        message.includes('occupancy_metadata') &&
        message.includes('Tai normalu, jei nuotolinės paslaugos vaizde nenaudojate papildomų metaduomenų'),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('tęsia darbą, kai nuotolinės paslaugos vaizde nėra nei occupancy_metadata, nei metadata stulpelių', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy_metadata does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.metadata does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: STATUS_OPTIONS.CLEAN,
            priority: null,
            status_notes: null,
            status_reported_by: null,
            status_created_at: null,
            occupancy_state: null,
            patient_code: null,
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: null,
            occupancy_created_at: null,
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(3);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[0][0]).toContain('occupancy_metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('occupancy_metadata:metadata');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[2][0]).not.toContain('occupancy_metadata');

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].occupancyMetadata).toEqual({ source: 'ed_board' });

    expect(
      warnSpy.mock.calls.some(([message]) => message.includes('occupancy_metadata')),
    ).toBe(false);
    expect(
      infoSpy.mock.calls.filter(([message]) => message.includes('occupancy_metadata')).length,
    ).toBeGreaterThanOrEqual(2);

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('prisitaiko prie schemos be occupancy_created_by stulpelio', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    supabaseMock.__mocks.aggregatedSelect
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'column aggregated_bed_state.occupancy_created_by does not exist' },
      }))
      .mockImplementationOnce(async () => ({
        data: [
          {
            bed_id: 'bed-uuid-1',
            label: 'IT1',
            status: STATUS_OPTIONS.CLEAN,
            priority: null,
            status_notes: null,
            status_reported_by: 'legacy@example.com',
            status_created_at: '2024-01-01T08:00:00.000Z',
            occupancy_state: null,
            patient_code: null,
            expected_until: null,
            occupancy_notes: null,
            occupancy_created_by: 'legacy@example.com',
            occupancy_created_at: null,
          },
        ],
        error: null,
      }));

    const aggregated = await manager.loadAggregatedBedState();

    expect(supabaseMock.__mocks.aggregatedSelect).toHaveBeenCalledTimes(2);
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[0][0]).toContain('occupancy_created_by');
    expect(supabaseMock.__mocks.aggregatedSelect.mock.calls[1][0]).toContain('occupancy_created_by:created_by');
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].occupancyCreatedBy).toBe('legacy@example.com');
    expect(
      warnSpy.mock.calls.some(([message]) =>
        message.includes('aggregated_bed_state view neturi stulpelio occupancy_created_by') &&
        message.includes('suderinamumo alias'),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
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
    ).rejects.toThrow('Nepavyko išsaugoti lovos būsenos nuotolinėje paslaugoje: Insert failed');
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
          occupancy: true,
          metadata: { occupancy: true },
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
    expect(target.occupancy).toBe(true);
    expect(target.occupancyCreatedAt).toBe(occupancyTimestamp);
    expect(manager.lastSyncCache).toBe(statusTimestamp);
    expect(global.localStorage.getItem('bed-management-last-sync')).toBe(statusTimestamp);
  });
});
