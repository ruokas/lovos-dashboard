import { parseSupabaseTimestamp } from '../utils/time.js';

export const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const TASK_PRIORITY = Object.freeze({
  LOW: 3,
  MEDIUM: 2,
  HIGH: 1,
});

function toIsoTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = parseSupabaseTimestamp(value) ?? new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normaliseRecurrence(recurrence) {
  if (!recurrence || typeof recurrence !== 'object') {
    return null;
  }

  const safe = { ...recurrence };
  if (typeof safe.type !== 'string') {
    safe.type = 'custom';
  }
  if (safe.interval != null) {
    const interval = Number.parseInt(safe.interval, 10);
    safe.interval = Number.isFinite(interval) && interval > 0 ? interval : 1;
  }
  return safe;
}

function normaliseHistoryEntry(entry) {
  if (!entry) {
    return null;
  }

  const createdAt = toIsoTimestamp(entry.createdAt ?? entry.created_at ?? entry.timestamp);

  return {
    id: entry.id ?? null,
    type: entry.type ?? entry.eventType ?? entry.event_type ?? 'updated',
    status: entry.status ?? null,
    description: entry.description ?? entry.notes ?? null,
    createdAt,
    createdBy: entry.createdBy ?? entry.created_by ?? null,
    metadata: { ...(entry.metadata ?? {}) },
  };
}

export class TaskData {
  constructor({
    id = null,
    category = 'general',
    description = '',
    priority = TASK_PRIORITY.MEDIUM,
    status = TASK_STATUS.PENDING,
    dueAt = null,
    recurrence = null,
    assignedTo = null,
    metadata = {},
    history = [],
    templateId = null,
  } = {}) {
    this.id = id;
    this.templateId = templateId;
    this.category = category;
    this.description = description;
    this.priority = Number.isFinite(priority) ? priority : TASK_PRIORITY.MEDIUM;
    this.status = Object.values(TASK_STATUS).includes(status) ? status : TASK_STATUS.PENDING;
    this.dueAt = toIsoTimestamp(dueAt);
    this.recurrence = normaliseRecurrence(recurrence);
    this.assignedTo = assignedTo;
    this.metadata = { ...metadata };
    this.history = Array.isArray(history)
      ? history.map(normaliseHistoryEntry).filter(Boolean)
      : [];
  }

  addHistory(entry) {
    const normalised = normaliseHistoryEntry(entry);
    if (!normalised) {
      return;
    }
    this.history = [...this.history, normalised];
  }

  toJSON() {
    return {
      id: this.id,
      templateId: this.templateId,
      category: this.category,
      description: this.description,
      priority: this.priority,
      status: this.status,
      dueAt: this.dueAt,
      recurrence: this.recurrence,
      assignedTo: this.assignedTo,
      metadata: this.metadata,
      history: this.history,
    };
  }

  static fromSupabase(row = {}) {
    const history = Array.isArray(row.task_events)
      ? row.task_events
          .map((event) => normaliseHistoryEntry({
            ...event,
            type: event.event_type,
            createdAt: event.created_at,
          }))
          .filter(Boolean)
          .sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          })
      : [];

    return new TaskData({
      id: row.id ?? null,
      templateId: row.template_id ?? null,
      category: row.category ?? 'general',
      description: row.description ?? '',
      priority: row.priority ?? TASK_PRIORITY.MEDIUM,
      status: row.status ?? TASK_STATUS.PENDING,
      dueAt: row.due_at ?? null,
      recurrence: row.recurrence ?? row.task_templates?.recurrence ?? null,
      assignedTo: row.assigned_to ?? null,
      metadata: { ...(row.metadata ?? {}), template: row.task_templates ?? undefined },
      history,
    });
  }
}

export class TaskTemplate {
  constructor({
    id = null,
    category = 'general',
    description = '',
    priority = TASK_PRIORITY.MEDIUM,
    status = 'active',
    dueAt = null,
    recurrence = null,
    assignedTo = null,
    metadata = {},
    history = [],
  } = {}) {
    this.id = id;
    this.category = category;
    this.description = description;
    this.priority = Number.isFinite(priority) ? priority : TASK_PRIORITY.MEDIUM;
    this.status = status;
    this.dueAt = toIsoTimestamp(dueAt);
    this.recurrence = normaliseRecurrence(recurrence);
    this.assignedTo = assignedTo;
    this.metadata = { ...metadata };
    this.history = Array.isArray(history)
      ? history.map(normaliseHistoryEntry).filter(Boolean)
      : [];
  }

  toJSON() {
    return {
      id: this.id,
      category: this.category,
      description: this.description,
      priority: this.priority,
      status: this.status,
      dueAt: this.dueAt,
      recurrence: this.recurrence,
      assignedTo: this.assignedTo,
      metadata: this.metadata,
      history: this.history,
    };
  }

  static fromSupabase(row = {}) {
    return new TaskTemplate({
      id: row.id ?? null,
      category: row.category ?? 'general',
      description: row.description ?? '',
      priority: row.priority ?? TASK_PRIORITY.MEDIUM,
      status: row.status ?? 'active',
      dueAt: row.due_at ?? null,
      recurrence: row.recurrence ?? null,
      assignedTo: row.assigned_to ?? null,
      metadata: row.metadata ?? {},
      history: Array.isArray(row.task_events)
        ? row.task_events
            .map((event) => normaliseHistoryEntry({
              ...event,
              type: event.event_type,
              createdAt: event.created_at,
            }))
            .filter(Boolean)
        : [],
    });
  }
}
