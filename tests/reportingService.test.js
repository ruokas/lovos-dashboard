import { describe, it, expect, vi } from 'vitest';
import { ReportingService } from '../reports/reportingService.js';
import { STATUS_OPTIONS, DEFAULT_SETTINGS } from '../models/bedData.js';

class FakeQuery {
  constructor(response) {
    this.response = response;
  }

  select() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.response.data ?? [], error: this.response.error ?? null }).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve({ data: this.response.data ?? [], error: this.response.error ?? null }).catch(reject);
  }

  finally(handler) {
    return Promise.resolve({ data: this.response.data ?? [], error: this.response.error ?? null }).finally(handler);
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
});
