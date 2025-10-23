import { STATUS_OPTIONS, DEFAULT_SETTINGS } from '../models/bedData.js';

const SUPABASE_SOURCE = 'supabase';
const LOCAL_SOURCE = 'local';
const ATTENTION_STATUSES = new Set([
  STATUS_OPTIONS.MESSY_BED,
  STATUS_OPTIONS.MISSING_EQUIPMENT,
  STATUS_OPTIONS.OTHER,
]);

const PRIORITY_BUCKETS = {
  high: (priority) => priority !== null && priority !== undefined && priority <= 1,
  medium: (priority) => priority === 2,
};

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOccupancyState(value) {
  if (!value) return 'unknown';
  return String(value).toLowerCase();
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class ReportingService {
  constructor(options = {}) {
    this.client = options.client ?? null;
    this.bedDataManager = options.bedDataManager ?? null;
    this.notificationManager = options.notificationManager ?? null;
    this.settings = options.settings ?? null;
  }

  setClient(client) {
    this.client = client;
  }

  setSettings(settings) {
    this.settings = settings;
  }

  #resolveSettings() {
    if (this.settings) {
      return this.settings;
    }
    if (this.bedDataManager?.settings) {
      return this.bedDataManager.settings;
    }
    return { ...DEFAULT_SETTINGS };
  }

  getLocalSnapshot() {
    if (!this.bedDataManager) {
      return {
        source: LOCAL_SOURCE,
        generatedAt: new Date().toISOString(),
        totals: {
          totalBeds: 0,
          cleanBeds: 0,
          messyBeds: 0,
          missingEquipment: 0,
          otherProblems: 0,
          attentionBeds: 0,
          occupiedBeds: 0,
          freeBeds: 0,
          bedsNeedingCheck: 0,
          recentlyFreedBeds: 0,
        },
        notifications: { total: 0, high: 0, medium: 0, low: 0 },
      };
    }

    const stats = this.bedDataManager.getStatistics();
    const beds = this.bedDataManager.getAllBeds();
    const notificationStats = this.notificationManager?.getNotificationStats
      ? this.notificationManager.getNotificationStats(beds)
      : { total: 0, high: 0, medium: 0, low: 0 };

    return {
      source: LOCAL_SOURCE,
      generatedAt: new Date().toISOString(),
      totals: {
        totalBeds: stats.totalBeds ?? beds.length,
        cleanBeds: stats.cleanBeds ?? 0,
        messyBeds: stats.messyBeds ?? 0,
        missingEquipment: stats.missingEquipment ?? 0,
        otherProblems: stats.otherProblems ?? 0,
        attentionBeds: (stats.messyBeds ?? 0) + (stats.missingEquipment ?? 0) + (stats.otherProblems ?? 0),
        occupiedBeds: stats.occupiedBeds ?? 0,
        freeBeds: stats.freeBeds ?? 0,
        bedsNeedingCheck: stats.bedsNeedingCheck ?? 0,
        recentlyFreedBeds: stats.recentlyFreedBeds ?? 0,
      },
      notifications: notificationStats,
    };
  }

  async fetchKpiSnapshot() {
    if (!this.client) {
      return this.getLocalSnapshot();
    }

    try {
      const { data, error } = await this.client
        .from('aggregated_bed_state')
        .select('bed_id,status,priority,occupancy_state,status_created_at,occupancy_created_at');

      if (error) {
        throw error;
      }

      return {
        ...this.#aggregateSupabaseSnapshot(data ?? []),
        source: SUPABASE_SOURCE,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ...this.getLocalSnapshot(),
        error,
      };
    }
  }

  async fetchDailyMetrics(options = {}) {
    const { limit = 7 } = options;
    if (!this.client) {
      return { source: LOCAL_SOURCE, data: [], message: 'Supabase nepasiekiamas' };
    }

    try {
      const query = this.client
        .from('daily_bed_metrics')
        .select('day,status_updates,occupancy_updates,avg_minutes_between_status_and_occupancy,sla_breaches')
        .order('day', { ascending: false });

      if (Number.isInteger(limit) && limit > 0) {
        query.limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      const normalized = (data ?? []).map((row) => ({
        day: row.day,
        statusUpdates: toNumber(row.status_updates, 0),
        occupancyUpdates: toNumber(row.occupancy_updates, 0),
        avgMinutesBetweenStatusAndOccupancy: row.avg_minutes_between_status_and_occupancy === null
          ? null
          : toNumber(row.avg_minutes_between_status_and_occupancy, null),
        slaBreaches: toNumber(row.sla_breaches, 0),
      }));

      return { source: SUPABASE_SOURCE, data: normalized };
    } catch (error) {
      return { source: LOCAL_SOURCE, data: [], error };
    }
  }

  async fetchInteractionAudit(options = {}) {
    const { limit = 20 } = options;

    if (!this.client) {
      return { source: LOCAL_SOURCE, data: [], message: 'Supabase nepasiekiamas' };
    }

    try {
      const query = this.client
        .from('user_interactions')
        .select('id,interaction_type,bed_id,tag_code,performed_by,payload,occurred_at')
        .order('occurred_at', { ascending: false });

      if (Number.isInteger(limit) && limit > 0) {
        query.limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      const normalized = (data ?? []).map((item) => ({
        id: item.id,
        interactionType: item.interaction_type,
        bedId: item.bed_id,
        tagCode: item.tag_code ?? null,
        performedBy: item.performed_by ?? null,
        occurredAt: item.occurred_at,
        payload: item.payload ?? {},
      }));

      return { source: SUPABASE_SOURCE, data: normalized };
    } catch (error) {
      return { source: LOCAL_SOURCE, data: [], error };
    }
  }

  async exportReport(options = {}) {
    const { format = 'json', signal } = options;
    if (!this.client) {
      throw new Error('Supabase klientas nepasiekiamas');
    }

    const normalizedFormat = format === 'csv' ? 'csv' : 'json';
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error('Naudotojo sesija nerasta – prisijunkite prie Supabase.');
    }

    const url = `${this.client.supabaseUrl}/functions/v1/report-export?format=${encodeURIComponent(normalizedFormat)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: normalizedFormat === 'csv' ? 'text/csv' : 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Nepavyko gauti ataskaitos iš Supabase.');
    }

    if (normalizedFormat === 'csv') {
      const text = await response.text();
      return { format: normalizedFormat, data: text };
    }

    const payload = await response.json();
    return { format: normalizedFormat, data: payload };
  }

  #aggregateSupabaseSnapshot(rows) {
    const totals = {
      totalBeds: 0,
      cleanBeds: 0,
      messyBeds: 0,
      missingEquipment: 0,
      otherProblems: 0,
      attentionBeds: 0,
      occupiedBeds: 0,
      freeBeds: 0,
      bedsNeedingCheck: 0,
      recentlyFreedBeds: 0,
    };

    const notificationBuckets = { total: 0, high: 0, medium: 0, low: 0 };
    const settings = this.#resolveSettings();
    const now = new Date();

    rows.forEach((row) => {
      totals.totalBeds += 1;
      const status = row.status ?? STATUS_OPTIONS.CLEAN;
      const priority = row.priority ?? null;
      const occupancyState = normalizeOccupancyState(row.occupancy_state);
      const statusAt = safeDate(row.status_created_at);
      const occupancyAt = safeDate(row.occupancy_created_at);

      if (status === STATUS_OPTIONS.CLEAN) {
        totals.cleanBeds += 1;
      } else if (status === STATUS_OPTIONS.MESSY_BED) {
        totals.messyBeds += 1;
      } else if (status === STATUS_OPTIONS.MISSING_EQUIPMENT) {
        totals.missingEquipment += 1;
      } else if (status === STATUS_OPTIONS.OTHER) {
        totals.otherProblems += 1;
      }

      if (ATTENTION_STATUSES.has(status)) {
        totals.attentionBeds += 1;
      }

      if (occupancyState === 'occupied') {
        totals.occupiedBeds += 1;
        if (statusAt) {
          const hoursSinceStatus = (now.getTime() - statusAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceStatus >= (settings?.checkIntervalOccupied ?? DEFAULT_SETTINGS.checkIntervalOccupied)) {
            totals.bedsNeedingCheck += 1;
          }
        }
      } else if (occupancyState === 'free') {
        totals.freeBeds += 1;
        if (occupancyAt) {
          const hoursSinceFree = (now.getTime() - occupancyAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceFree <= (settings?.recentlyFreedThreshold ?? DEFAULT_SETTINGS.recentlyFreedThreshold)) {
            totals.recentlyFreedBeds += 1;
          }
        }
      }

      if (priority !== null && priority > 0) {
        notificationBuckets.total += 1;
        if (PRIORITY_BUCKETS.high(priority)) {
          notificationBuckets.high += 1;
        } else if (PRIORITY_BUCKETS.medium(priority)) {
          notificationBuckets.medium += 1;
        } else {
          notificationBuckets.low += 1;
        }
      }
    });

    return {
      totals,
      notifications: notificationBuckets,
    };
  }
}

export function createReportingService(options = {}) {
  return new ReportingService(options);
}
