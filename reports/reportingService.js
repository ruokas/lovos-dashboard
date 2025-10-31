import { STATUS_OPTIONS, DEFAULT_SETTINGS } from '../models/bedData.js';
import { TASK_PRIORITIES, TASK_STATUSES } from '../models/taskData.js';

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

const TASK_SLA_THRESHOLD_MINUTES = 60;

const TASK_SLA_LABELS = {
  completed: 'Įvykdyta',
  breach: 'Viršytas terminas',
  due_soon: 'Artėja terminas',
  on_track: 'Laiku',
  no_due: 'Terminas nenustatytas',
};

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function parseOccupancyFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    return value !== 0;
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  if (['1', 't', 'true', 'y', 'yes', 'occupied', 'uzimta', 'uzimtas'].includes(normalized)) {
    return true;
  }

  if (
    [
      '0',
      'f',
      'false',
      'n',
      'no',
      'free',
      'laisva',
      'laisvas',
      'laisvi',
      'laisvos',
      'available',
      'neuzimta',
      'neuzimtas',
      'neuzimt',
    ].includes(normalized)
  ) {
    return false;
  }

  return null;
}

function normalizeOccupancyState(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return 'unknown';
  }

  if (['cleaning', 'tvarkoma', 'valoma', 'dezinfekuojama', 'plaunama'].some((alias) => normalized.includes(alias))) {
    return 'cleaning';
  }

  if (['reserved', 'rezervuota', 'rezervuotas', 'rezerv'].some((alias) => normalized.includes(alias))) {
    return 'reserved';
  }

  if (['occupied', 'uzimta', 'uzimtas', 'pacio', 'pacient', '1', 'true', 't', 'yes'].some((alias) => normalized.includes(alias))) {
    return 'occupied';
  }

  if (
    ['free', 'laisva', 'laisvas', 'laisvi', 'laisvos', 'available', 'neuzimta', 'neuzimtas', '0', 'false', 'f', 'no'].some(
      (alias) => normalized.includes(alias),
    )
  ) {
    return 'free';
  }

  return normalized;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTaskPriority(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return TASK_PRIORITIES.MEDIUM;
  }
  return Math.min(Math.max(numeric, TASK_PRIORITIES.CRITICAL), TASK_PRIORITIES.LOW);
}

function normaliseTaskStatus(value) {
  if (!value) {
    return TASK_STATUSES.PLANNED;
  }
  const allowed = new Set(Object.values(TASK_STATUSES));
  return allowed.has(value) ? value : TASK_STATUSES.PLANNED;
}

function minutesBetween(later, earlier) {
  if (!(later instanceof Date) || !(earlier instanceof Date)) {
    return null;
  }
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60));
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapePdfText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const ascii = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export class ReportingService {
  constructor(options = {}) {
    this.client = options.client ?? null;
    this.bedDataManager = options.bedDataManager ?? null;
    this.notificationManager = options.notificationManager ?? null;
    this.settings = options.settings ?? null;
    this.taskManager = options.taskManager ?? null;
  }

  setClient(client) {
    this.client = client;
  }

  setSettings(settings) {
    this.settings = settings;
  }

  setTaskManager(taskManager) {
    this.taskManager = taskManager;
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
      const taskData = this.#buildTaskExportData();
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
        taskMetrics: taskData.metrics,
        sharedTasks: taskData.items,
        taskEvents: taskData.events,
      };
    }

    const stats = this.bedDataManager.getStatistics();
    const beds = this.bedDataManager.getAllBeds();
    const notificationStats = this.notificationManager?.getNotificationStats
      ? this.notificationManager.getNotificationStats(beds)
      : { total: 0, high: 0, medium: 0, low: 0 };
    const taskData = this.#buildTaskExportData();

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
      taskMetrics: taskData.metrics,
      sharedTasks: taskData.items,
      taskEvents: taskData.events,
    };
  }

  async fetchKpiSnapshot() {
    if (!this.client) {
      return this.getLocalSnapshot();
    }

    try {
      const { data, error } = await this.client
        .from('aggregated_bed_state')
        .select('bed_id,status,priority,occupancy_state,occupancy,status_created_at,occupancy_created_at');

      if (error) {
        throw error;
      }

      const taskData = this.#buildTaskExportData();
      const taskOverlay = taskData.items.length || taskData.events.length
        ? { taskMetrics: taskData.metrics, sharedTasks: taskData.items, taskEvents: taskData.events }
        : {};

      return {
        ...this.#aggregateSupabaseSnapshot(data ?? []),
        ...taskOverlay,
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
      return { source: LOCAL_SOURCE, data: [], message: 'Nuotolinė paslauga nepasiekiama' };
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
      return { source: LOCAL_SOURCE, data: [], message: 'Nuotolinė paslauga nepasiekiama' };
    }

    let schemaError = null;

    for (const attempt of this.#interactionQueryAttempts(limit)) {
      try {
        const rows = await this.#performInteractionQuery(attempt);
        return {
          source: SUPABASE_SOURCE,
          data: this.#normaliseInteractionRows(rows),
          downgraded: attempt.downgraded ?? false,
          legacySchema: attempt.legacySchema ?? false,
        };
      } catch (error) {
        if (this.#isSchemaMismatchError(error)) {
          schemaError = error;
          continue;
        }
        return { source: LOCAL_SOURCE, data: [], error };
      }
    }

    return {
      source: LOCAL_SOURCE,
      data: [],
      error: schemaError ?? new Error('Nepavyko nuskaityti audito duomenų dėl neatpažintos schemos.'),
    };
  }

  async exportReport(options = {}) {
    const { format = 'json', signal } = options;
    const normalizedFormat = ['csv', 'json', 'pdf'].includes(String(format).toLowerCase())
      ? String(format).toLowerCase()
      : 'json';

    if (normalizedFormat === 'pdf') {
      const taskData = this.#buildTaskExportData();
      const buffer = this.#generateTaskPdfBuffer(taskData);
      return { format: 'pdf', data: buffer };
    }

    if (!this.client) {
      throw new Error('Nuotolinės paslaugos klientas nepasiekiamas');
    }

    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error('Naudotojo sesija nerasta – prisijunkite prie sistemos.');
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
      throw new Error(errorText || 'Nepavyko gauti ataskaitos iš nuotolinės paslaugos.');
    }

    if (normalizedFormat === 'csv') {
      const text = await response.text();
      return { format: normalizedFormat, data: this.#appendTasksToCsv(text) };
    }

    const payload = await response.json();
    return { format: normalizedFormat, data: this.#enrichPayloadWithTasks(payload) };
  }

  async #performInteractionQuery({ select, orderBy, limit }) {
    const query = this.client
      .from('user_interactions')
      .select(select)
      .order(orderBy, { ascending: false });

    if (Number.isInteger(limit) && limit > 0) {
      query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data ?? [];
  }

  #interactionQueryAttempts(limit) {
    const base = Number.isInteger(limit) && limit > 0 ? limit : null;
    const attempts = [
      {
        select: 'id,interaction_type,bed_id,tag_code,performed_by,payload,occurred_at',
        orderBy: 'occurred_at',
      },
      {
        select: 'id,interaction_type,bed_id,performed_by,payload,occurred_at',
        orderBy: 'occurred_at',
        downgraded: true,
      },
      {
        select: 'id,action,bed_id,performed_by,payload,created_at',
        orderBy: 'created_at',
        downgraded: true,
        legacySchema: true,
      },
    ];

    if (base === null) {
      return attempts;
    }

    return attempts.map((attempt) => ({ ...attempt, limit: base }));
  }

  #isSchemaMismatchError(error) {
    if (!error) {
      return false;
    }
    const code = String(error.code ?? '').toUpperCase();
    if (code === '42703' || code === 'PGRST204' || code === 'PGRST116') {
      return true;
    }
    const message = String(error.message ?? '').toLowerCase();
    if (!message) {
      return false;
    }
    return (
      message.includes('does not exist') ||
      message.includes('unknown column') ||
      message.includes('column') && message.includes('not found')
    );
  }

  #normaliseInteractionRows(rows) {
    return (rows ?? []).map((item) => ({
      id: item.id ?? null,
      interactionType: item.interaction_type ?? item.action ?? null,
      bedId: item.bed_id ?? null,
      tagCode: item.tag_code ?? null,
      performedBy: item.performed_by ?? null,
      occurredAt: item.occurred_at ?? item.created_at ?? null,
      payload: this.#normaliseInteractionPayload(item.payload),
    }));
  }

  #normaliseInteractionPayload(value) {
    if (value === null || value === undefined) {
      return {};
    }
    if (typeof value === 'object') {
      return value;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null ? parsed : { raw: value };
      } catch (error) {
        return { raw: value };
      }
    }
    return {};
  }

  #buildTaskExportData() {
    if (!this.taskManager?.getTasks) {
      return { metrics: null, items: [], events: [] };
    }

    const tasks = this.taskManager.getTasks();
    const now = new Date();

    const items = tasks.map((task) => {
      const dueAt = safeDate(task.dueAt ?? task.deadline);
      const createdAt = safeDate(task.createdAt);
      const updatedAt = safeDate(task.updatedAt);
      const priority = parseTaskPriority(task.priority);
      const status = normaliseTaskStatus(task.status);
      const sla = this.#classifyTaskSla(status, dueAt, now);

      return {
        id: task.id,
        title: task.title ?? task.typeLabel ?? task.type ?? 'Užduotis',
        description: task.description ?? '',
        channel: task.channelLabel ?? task.channel ?? '',
        responsible: task.responsible ?? '',
        priority,
        status,
        dueAt: dueAt ? dueAt.toISOString() : null,
        createdAt: createdAt ? createdAt.toISOString() : null,
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        sla,
        source: task.source ?? 'local',
      };
    });

    const metrics = items.reduce((acc, task) => {
      acc.total += 1;
      if (task.priority <= TASK_PRIORITIES.CRITICAL) {
        acc.critical += 1;
      } else if (task.priority === TASK_PRIORITIES.HIGH) {
        acc.high += 1;
      } else if (task.priority === TASK_PRIORITIES.MEDIUM) {
        acc.medium += 1;
      } else {
        acc.low += 1;
      }

      if (task.status === TASK_STATUSES.COMPLETED) {
        acc.completed += 1;
      } else if (task.sla.code === 'breach') {
        acc.overdue += 1;
      } else if (task.sla.code === 'due_soon') {
        acc.dueSoon += 1;
      } else {
        acc.onTrack += 1;
      }
      return acc;
    }, { total: 0, critical: 0, high: 0, medium: 0, low: 0, overdue: 0, dueSoon: 0, onTrack: 0, completed: 0 });

    const events = this.#buildTaskEvents(items);

    return { metrics, items, events };
  }

  #classifyTaskSla(status, dueAt, now) {
    if (status === TASK_STATUSES.COMPLETED) {
      return { code: 'completed', label: TASK_SLA_LABELS.completed, minutesUntilDue: null };
    }

    if (!dueAt) {
      return { code: 'no_due', label: TASK_SLA_LABELS.no_due, minutesUntilDue: null };
    }

    const minutesUntilDue = Math.round((dueAt.getTime() - now.getTime()) / (1000 * 60));
    if (minutesUntilDue < 0) {
      return { code: 'breach', label: TASK_SLA_LABELS.breach, minutesUntilDue };
    }

    if (minutesUntilDue <= TASK_SLA_THRESHOLD_MINUTES) {
      return { code: 'due_soon', label: TASK_SLA_LABELS.due_soon, minutesUntilDue };
    }

    return { code: 'on_track', label: TASK_SLA_LABELS.on_track, minutesUntilDue };
  }

  #buildTaskEvents(tasks) {
    const events = [];
    tasks.forEach((task) => {
      if (task.createdAt) {
        events.push({
          id: `${task.id}-created`,
          taskId: task.id,
          type: 'created',
          status: task.status,
          occurredAt: task.createdAt,
        });
      }

      if (task.updatedAt && task.updatedAt !== task.createdAt) {
        events.push({
          id: `${task.id}-updated`,
          taskId: task.id,
          type: 'updated',
          status: task.status,
          occurredAt: task.updatedAt,
        });
      }

      if (task.status === TASK_STATUSES.COMPLETED && task.updatedAt) {
        events.push({
          id: `${task.id}-completed`,
          taskId: task.id,
          type: 'completed',
          status: task.status,
          occurredAt: task.updatedAt,
        });
      }
    });

    return events
      .filter((event) => Boolean(event.occurredAt))
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }

  #appendTasksToCsv(csvText) {
    const taskData = this.#buildTaskExportData();
    if (!taskData.items.length && !taskData.events.length) {
      return csvText;
    }

    const lines = [];
    if (csvText) {
      lines.push(csvText.trimEnd());
      lines.push('');
    }

    if (taskData.items.length) {
      lines.push('"Bendros užduotys"');
      lines.push('id,title,status,due_at,priority,responsible,channel,sla_label,minutes_until_due');
      taskData.items.forEach((task) => {
        lines.push([
          escapeCsvValue(task.id),
          escapeCsvValue(task.title),
          escapeCsvValue(task.status),
          escapeCsvValue(task.dueAt ?? ''),
          escapeCsvValue(task.priority),
          escapeCsvValue(task.responsible),
          escapeCsvValue(task.channel),
          escapeCsvValue(task.sla.label),
          escapeCsvValue(task.sla.minutesUntilDue ?? ''),
        ].join(','));
      });
      lines.push('');
    }

    if (taskData.events.length) {
      lines.push('"task_events"');
      lines.push('event_id,task_id,type,status,occurred_at');
      taskData.events.forEach((event) => {
        lines.push([
          escapeCsvValue(event.id),
          escapeCsvValue(event.taskId),
          escapeCsvValue(event.type),
          escapeCsvValue(event.status),
          escapeCsvValue(event.occurredAt),
        ].join(','));
      });
    }

    return lines.join('\n');
  }

  #enrichPayloadWithTasks(payload) {
    const taskData = this.#buildTaskExportData();
    if (!taskData.items.length && !taskData.events.length) {
      return payload;
    }
    return {
      ...payload,
      taskMetrics: taskData.metrics,
      sharedTasks: taskData.items,
      taskEvents: taskData.events,
    };
  }

  #generateTaskPdfBuffer(taskData) {
    if (!taskData.items.length && !taskData.events.length) {
      return new Uint8Array();
    }

    const sections = [];
    sections.push('Bendros užduotys');
    taskData.items.forEach((task, index) => {
      const dueLabel = task.dueAt ? new Date(task.dueAt).toLocaleString('lt-LT') : '—';
      const line = `${index + 1}. ${task.title} – ${task.sla.label} (iki ${dueLabel})`;
      sections.push(line);
    });

    if (taskData.events.length) {
      sections.push('');
      sections.push('task_events');
      taskData.events.forEach((event) => {
        const timestamp = event.occurredAt ? new Date(event.occurredAt).toLocaleString('lt-LT') : '—';
        sections.push(`• ${event.type} (${event.status}) – ${timestamp}`);
      });
    }

    const commands = sections
      .map((line, index) => `${index === 0 ? '' : 'T* ' }(${escapePdfText(line)}) Tj`)
      .join('\n');

    const content = `BT /F1 12 Tf 48 800 Td 14 TL ${commands} ET`;
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);

    const objects = [];
    const addObject = (body) => {
      const object = `${objects.length + 1} 0 obj\n${body}\nendobj\n`;
      objects.push(object);
      return objects.length;
    };

    addObject('<< /Type /Catalog /Pages 2 0 R >>');
    addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    addObject(`<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`);
    addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    const header = '%PDF-1.4\n';
    const body = objects.join('');
    let offset = header.length;
    const xrefEntries = ['0000000000 65535 f \n'];

    objects.forEach((object) => {
      xrefEntries.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
      offset += object.length;
    });

    const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join('')}`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${header.length + body.length}\n%%EOF`;
    const pdfString = header + body + xref + trailer;
    return encoder.encode(pdfString);
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
      const occupancyFlag = parseOccupancyFlag(row.occupancy ?? row.is_occupied ?? row.occupancy_state);
      const occupancyState = (() => {
        if (typeof occupancyFlag === 'boolean') {
          return occupancyFlag ? 'occupied' : 'free';
        }
        return normalizeOccupancyState(row.occupancy_state);
      })();
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
