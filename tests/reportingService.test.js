import { describe, it, expect, vi } from 'vitest';
import { ReportingService } from '../reports/reportingService.js';
import { STATUS_OPTIONS, DEFAULT_SETTINGS } from '../models/bedData.js';

class FakeQuery {
  constructor(response) {
    this.response = response;
    this.selectArgs = null;
    this.orderArgs = null;
    this.limitValue = null;
    this.hasResolved = false;
    this.cachedResponse = undefined;
  }

  select(value) {
    this.selectArgs = value;
    return this;
  }

  order(column, options) {
    this.orderArgs = { column, options };
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  #getResponse() {
    if (!this.hasResolved) {
      this.cachedResponse =
        typeof this.response === 'function'
          ? this.response({ select: this.selectArgs ?? '', order: this.orderArgs, limit: this.limitValue })
          : this.response;
      this.hasResolved = true;
    }
    return this.cachedResponse ?? {};
  }

  then(resolve, reject) {
    try {
      return Promise.resolve(this.#getResponse()).then(resolve, reject);
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
  }

  catch(reject) {
    try {
      return Promise.resolve(this.#getResponse()).catch(reject);
    } catch (error) {
      return Promise.reject(error).catch(reject);
    }
  }

  finally(handler) {
    try {
      return Promise.resolve(this.#getResponse()).finally(handler);
    } catch (error) {
      return Promise.reject(error).finally(handler);
    }
  }
}

class FakeSupabaseClient {
  constructor({ aggregated = {}, daily = {}, interactions = {} } = {}) {
    this.responses = { aggregated, daily, interactions };
    this.auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    };
    this.supabaseUrl = 'https://example.supabase.co';
  }

  from(table) {
    if (table === 'aggregated_bed_state') {
      return new FakeQuery(this.responses.aggregated);
    }
    if (table === 'daily_bed_metrics') {
      return new FakeQuery(this.responses.daily);
    }
    if (table === 'user_interactions') {
      return new FakeQuery(this.responses.interactions);
    }
    throw new Error(`Unexpected table ${table}`);
  }
}

describe('ReportingService', () => {
  it('grąžina vietinę suvestinę kai Supabase neprieinamas', async () => {
    const service = new ReportingService({
      bedDataManager: {
        getStatistics: () => ({
          totalBeds: 2,
          cleanBeds: 1,
          messyBeds: 1,
          missingEquipment: 0,
          otherProblems: 0,
          attentionBeds: 1,
          occupiedBeds: 1,
          freeBeds: 1,
          bedsNeedingCheck: 0,
          recentlyFreedBeds: 0,
        }),
        getAllBeds: () => [],
      },
      notificationManager: {
        getNotificationStats: () => ({ total: 2, high: 1, medium: 1, low: 0 }),
      },
    });

    const snapshot = await service.fetchKpiSnapshot();
    expect(snapshot.source).toBe('local');
    expect(snapshot.totals.totalBeds).toBe(2);
    expect(snapshot.notifications.total).toBe(2);
  });

  it('agreguoja Supabase suvestinę', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const client = new FakeSupabaseClient({
      aggregated: {
        data: [
          {
            bed_id: '1',
            status: STATUS_OPTIONS.CLEAN,
            priority: 1,
            occupancy_state: 'occupied',
            status_created_at: oneHourAgo,
            occupancy_created_at: oneHourAgo,
          },
          {
            bed_id: '2',
            status: STATUS_OPTIONS.MESSY_BED,
            priority: 2,
            occupancy_state: 'free',
            status_created_at: oneHourAgo,
            occupancy_created_at: thirtyMinutesAgo,
          },
        ],
      },
    });

    const service = new ReportingService({
      client,
      bedDataManager: { settings: { ...DEFAULT_SETTINGS, checkIntervalOccupied: 0.5, recentlyFreedThreshold: 1 } },
    });

    const snapshot = await service.fetchKpiSnapshot();
    expect(snapshot.source).toBe('supabase');
    expect(snapshot.totals.totalBeds).toBe(2);
    expect(snapshot.totals.cleanBeds).toBe(1);
    expect(snapshot.totals.attentionBeds).toBe(1);
    expect(snapshot.totals.recentlyFreedBeds).toBe(1);
    expect(snapshot.notifications.total).toBe(2);
  });

  it('gauna dienos metrikas iš Supabase', async () => {
    const client = new FakeSupabaseClient({
      daily: {
        data: [
          {
            day: '2024-08-01',
            status_updates: 5,
            occupancy_updates: 3,
            avg_minutes_between_status_and_occupancy: 12.5,
            sla_breaches: 1,
          },
        ],
      },
    });

    const service = new ReportingService({ client });
    const result = await service.fetchDailyMetrics({ limit: 5 });
    expect(result.source).toBe('supabase');
    expect(result.data[0].statusUpdates).toBe(5);
    expect(result.data[0].avgMinutesBetweenStatusAndOccupancy).toBeCloseTo(12.5);
  });

  it('grąžina tuščią metrikų sąrašą kai Supabase klaida', async () => {
    const client = new FakeSupabaseClient({
      daily: { error: new Error('db error') },
    });
    const service = new ReportingService({ client });
    const result = await service.fetchDailyMetrics();
    expect(result.source).toBe('local');
    expect(result.data).toHaveLength(0);
  });

  it('prideda bendrų užduočių suvestinę į vietinę ataskaitą', async () => {
    const taskManager = {
      getTasks: () => ([
        {
          id: 'task-1',
          title: 'Laboratoriniai mėginiai',
          description: 'Transportuoti mėginius į centrinę laboratoriją',
          priority: 1,
          dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          status: 'planned',
          zone: 'laboratory',
          zoneLabel: 'Laboratorija',
          channel: 'laboratory',
          channelLabel: 'Laboratorija',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          responsible: 'Kurjeris',
          metadata: { patient: { surname: 'Petraitis', chartNumber: 'A123' } },
        },
      ]),
    };

    const service = new ReportingService({
      bedDataManager: {
        getStatistics: () => ({ totalBeds: 0 }),
        getAllBeds: () => [],
      },
      taskManager,
    });

    const snapshot = service.getLocalSnapshot();
    expect(snapshot.taskMetrics.total).toBe(1);
    expect(snapshot.sharedTasks[0].title).toContain('Laboratoriniai');
    expect(snapshot.taskEvents.length).toBeGreaterThan(0);
  });

  it('gauna audito įrašus', async () => {
    const client = new FakeSupabaseClient({
      interactions: {
        data: [
          {
            id: '1',
            interaction_type: 'bed_status_saved',
            bed_id: '1',
            tag_code: null,
            performed_by: 'nurse@example.com',
            occurred_at: '2024-08-01T10:00:00Z',
            payload: { status: STATUS_OPTIONS.CLEAN },
          },
        ],
      },
    });

    const service = new ReportingService({ client });
    const audit = await service.fetchInteractionAudit({ limit: 1 });
    expect(audit.source).toBe('supabase');
    expect(audit.data[0].interactionType).toBe('bed_status_saved');
  });

  it('grąžina vietinį audito atsakymą kai Supabase klaida', async () => {
    const client = new FakeSupabaseClient({
      interactions: { error: new Error('rls') },
    });
    const service = new ReportingService({ client });
    const audit = await service.fetchInteractionAudit();
    expect(audit.source).toBe('local');
    expect(audit.data).toHaveLength(0);
  });

  it('grąžina audito įrašus kai tag_code stulpelis neegzistuoja', async () => {
    const handler = vi.fn(({ select }) => {
      if (select.includes('tag_code')) {
        return { data: [], error: { code: '42703', message: "column 'tag_code' does not exist" } };
      }
      return {
        data: [
          {
            id: '1',
            interaction_type: 'bed_status_saved',
            bed_id: '1',
            performed_by: 'nurse@example.com',
            occurred_at: '2024-08-01T10:00:00Z',
            payload: { status: STATUS_OPTIONS.CLEAN },
          },
        ],
        error: null,
      };
    });

    const client = new FakeSupabaseClient({
      interactions: handler,
    });

    const service = new ReportingService({ client });
    const audit = await service.fetchInteractionAudit({ limit: 5 });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(audit.source).toBe('supabase');
    expect(audit.downgraded).toBe(true);
    expect(audit.legacySchema).toBeFalsy();
    expect(audit.data).toHaveLength(1);
    expect(audit.data[0].interactionType).toBe('bed_status_saved');
  });

  it('grąžina audito įrašus iš senos schemos', async () => {
    const handler = vi.fn(({ select }) => {
      if (select.includes('interaction_type')) {
        return { data: [], error: { code: '42703', message: "column 'interaction_type' does not exist" } };
      }
      return {
        data: [
          {
            id: '1',
            action: 'bed_status_saved',
            bed_id: '1',
            performed_by: 'nurse@example.com',
            created_at: '2024-08-02T12:00:00Z',
            payload: JSON.stringify({ status: STATUS_OPTIONS.MESSY_BED }),
          },
        ],
        error: null,
      };
    });

    const client = new FakeSupabaseClient({
      interactions: handler,
    });

    const service = new ReportingService({ client });
    const audit = await service.fetchInteractionAudit({ limit: 10 });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(audit.source).toBe('supabase');
    expect(audit.downgraded).toBe(true);
    expect(audit.legacySchema).toBe(true);
    expect(audit.data[0].interactionType).toBe('bed_status_saved');
    expect(audit.data[0].occurredAt).toBe('2024-08-02T12:00:00Z');
    expect(audit.data[0].payload.status).toBe(STATUS_OPTIONS.MESSY_BED);
  });

  it('grąžina vietinį atsakymą kai schema neatpažįstama', async () => {
    const handler = vi.fn(() => ({
      data: [],
      error: { code: '42703', message: "column 'totally_new_column' does not exist" },
    }));

    const client = new FakeSupabaseClient({ interactions: handler });
    const service = new ReportingService({ client });

    const audit = await service.fetchInteractionAudit({ limit: 3 });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(audit.source).toBe('local');
    expect(audit.data).toHaveLength(0);
    expect(audit.error).toBeTruthy();
  });
});
