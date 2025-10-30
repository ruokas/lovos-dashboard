const FALLBACK_ID_PREFIX = 'task-';
export const TASK_STORAGE_KEY = 'lovos-dashboard.tasks.v1';

export const TASK_STATUSES = {
  PLANNED: 'planned',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
};

export const TASK_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

export const TASK_TYPE_OPTIONS = [
  { value: 'patientCare', labelKey: 'patientCare' },
  { value: 'logistics', labelKey: 'logistics' },
  { value: 'communication', labelKey: 'communication' },
  { value: 'training', labelKey: 'training' },
];

export const TASK_RECURRENCE_OPTIONS = [
  { value: 'none', labelKey: 'none' },
  { value: 'perShift', labelKey: 'perShift' },
  { value: 'daily', labelKey: 'daily' },
  { value: 'weekly', labelKey: 'weekly' },
];

export const TASK_CHANNEL_OPTIONS = [
  { value: 'laboratory', labelKey: 'laboratory' },
  { value: 'ambulatory', labelKey: 'ambulatory' },
  { value: 'wards', labelKey: 'wards' },
];

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareTasks(a, b) {
  if (!a || !b) {
    return 0;
  }

  const aPriority = Number.isFinite(a.priority) ? a.priority : TASK_PRIORITIES.MEDIUM;
  const bPriority = Number.isFinite(b.priority) ? b.priority : TASK_PRIORITIES.MEDIUM;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aDue = toDate(a.dueAt ?? a.deadline);
  const bDue = toDate(b.dueAt ?? b.deadline);

  const aHasDue = Boolean(aDue);
  const bHasDue = Boolean(bDue);

  if (aHasDue && bHasDue) {
    if (aDue.getTime() !== bDue.getTime()) {
      return aDue.getTime() - bDue.getTime();
    }
  } else if (aHasDue) {
    return -1;
  } else if (bHasDue) {
    return 1;
  }

  const aCreated = toDate(a.createdAt)?.getTime() ?? 0;
  const bCreated = toDate(b.createdAt)?.getTime() ?? 0;
  if (aCreated !== bCreated) {
    return aCreated - bCreated;
  }

  const aTitle = typeof a.title === 'string' ? a.title : '';
  const bTitle = typeof b.title === 'string' ? b.title : '';
  return aTitle.localeCompare(bTitle, 'lt-LT');
}

export function sortTasksByPriorityAndDue(tasks = []) {
  const list = Array.isArray(tasks) ? tasks.slice() : [];
  return list.sort(compareTasks);
}

function deriveFrequencyMinutes(occurrences = [], explicitValue) {
  if (Number.isFinite(explicitValue) && explicitValue > 0) {
    return explicitValue;
  }

  if (!Array.isArray(occurrences) || occurrences.length < 2) {
    return null;
  }

  const deltas = [];
  for (let index = 1; index < occurrences.length; index += 1) {
    const previous = occurrences[index - 1];
    const current = occurrences[index];
    const previousDue = toDate(previous?.dueAt ?? previous?.deadline);
    const currentDue = toDate(current?.dueAt ?? current?.deadline);
    if (!previousDue || !currentDue) {
      continue;
    }
    const diffMinutes = Math.round((currentDue.getTime() - previousDue.getTime()) / 60000);
    if (diffMinutes > 0) {
      deltas.push(diffMinutes);
    }
  }

  if (!deltas.length) {
    return null;
  }

  return deltas.reduce((min, value) => Math.min(min, value), deltas[0]);
}

function deriveFrequencyLabel(frequencyMinutes, explicitLabel, fallbackLabel, fallbackKey) {
  const label = typeof explicitLabel === 'string' ? explicitLabel.trim() : '';
  if (label) {
    return label;
  }

  if (Number.isFinite(frequencyMinutes) && frequencyMinutes > 0) {
    if (frequencyMinutes % 1440 === 0) {
      const days = frequencyMinutes / 1440;
      return days === 1 ? 'Kasdien' : `Kas ${days} d.`;
    }
    if (frequencyMinutes % 60 === 0) {
      const hours = frequencyMinutes / 60;
      return hours === 1 ? 'Kas valandą' : `Kas ${hours} val.`;
    }
    return `Kas ${frequencyMinutes} min.`;
  }

  const normalizedFallback = typeof fallbackLabel === 'string' ? fallbackLabel.trim() : '';
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const normalizedKey = typeof fallbackKey === 'string' ? fallbackKey.trim() : '';
  if (normalizedKey) {
    return normalizedKey;
  }

  return 'Pasikartojanti';
}

function pickFrequencyCandidate(values = []) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export function mergeRecurringTasksForDisplay(tasks = [], options = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const referenceDate = options.referenceDate instanceof Date && !Number.isNaN(options.referenceDate?.getTime?.())
    ? new Date(options.referenceDate)
    : new Date();

  const standaloneTasks = [];
  const seriesMap = new Map();

  for (const task of tasks) {
    if (!task || typeof task !== 'object') {
      continue;
    }

    if (task.source === 'scheduler' && task.seriesId) {
      const existing = seriesMap.get(task.seriesId);
      if (existing) {
        existing.occurrences.push(task);
      } else {
        seriesMap.set(task.seriesId, { template: task, occurrences: [task] });
      }
      continue;
    }

    standaloneTasks.push({
      ...task,
      metadata: task.metadata ? { ...task.metadata } : {},
    });
  }

  for (const [seriesId, entry] of seriesMap.entries()) {
    const sortedOccurrences = sortTasksByPriorityAndDue(entry.occurrences);
    if (sortedOccurrences.length === 0) {
      continue;
    }

    const nextOccurrence = sortedOccurrences.find((occurrence) => {
      const dueDate = toDate(occurrence?.dueAt ?? occurrence?.deadline);
      return dueDate && dueDate.getTime() >= referenceDate.getTime();
    }) ?? sortedOccurrences[0];

    const earliestCreated = sortedOccurrences.reduce((earliest, occurrence) => {
      const created = toDate(occurrence?.createdAt);
      if (!created) {
        return earliest;
      }
      if (!earliest || created.getTime() < earliest.getTime()) {
        return created;
      }
      return earliest;
    }, null);

    const metadataSources = [
      entry.template?.metadata ?? {},
      nextOccurrence?.metadata ?? {},
    ];

    const mergedMetadata = metadataSources.reduce((acc, source) => Object.assign(acc, source), {});

    const frequencyMinutes = pickFrequencyCandidate([
      mergedMetadata.recurringFrequencyMinutes,
      mergedMetadata.frequencyMinutes,
      entry.template?.frequencyMinutes,
    ]);

    const derivedFrequencyMinutes = deriveFrequencyMinutes(sortedOccurrences, frequencyMinutes);
    const frequencyLabel = deriveFrequencyLabel(
      derivedFrequencyMinutes,
      mergedMetadata.frequencyLabel ?? mergedMetadata.recurringFrequencyLabel,
      entry.template?.recurrenceLabel,
      entry.template?.recurrence,
    );

    const occurrenceIds = sortedOccurrences.map((occurrence) => occurrence.id);
    const highestPriority = sortedOccurrences.reduce((minPriority, occurrence) => {
      const priority = Number.isFinite(occurrence?.priority) ? occurrence.priority : TASK_PRIORITIES.MEDIUM;
      return Math.min(minPriority, priority);
    }, TASK_PRIORITIES.LOW);

    const representative = {
      ...nextOccurrence,
      id: seriesId,
      dueAt: nextOccurrence?.dueAt ?? nextOccurrence?.deadline ?? null,
      deadline: nextOccurrence?.deadline ?? nextOccurrence?.dueAt ?? null,
      status: nextOccurrence?.status ?? entry.template?.status ?? TASK_STATUSES.PLANNED,
      priority: highestPriority,
      createdAt: earliestCreated ? earliestCreated.toISOString() : (nextOccurrence?.createdAt ?? entry.template?.createdAt),
      updatedAt: nextOccurrence?.updatedAt ?? entry.template?.updatedAt ?? nextOccurrence?.createdAt,
      metadata: {
        ...mergedMetadata,
        recurringFrequencyMinutes: derivedFrequencyMinutes ?? null,
        recurringFrequencyLabel: frequencyLabel,
        recurringOccurrencesCount: sortedOccurrences.length,
        recurringNextDueAt: nextOccurrence?.dueAt ?? null,
        recurringSourceTaskIds: occurrenceIds,
      },
      recurrence: nextOccurrence?.recurrence ?? entry.template?.recurrence ?? 'recurring',
      recurrenceLabel: frequencyLabel,
    };

    standaloneTasks.push(representative);
  }

  return sortTasksByPriorityAndDue(standaloneTasks);
}

function isLocalStorageAvailable() {
  try {
    return typeof localStorage !== 'undefined';
  } catch (error) {
    console.warn('LocalStorage neprieinamas:', error);
    return false;
  }
}

function safeParse(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Nepavyko perskaityti užduočių iš localStorage:', error);
    return [];
  }
}

function safeIsoString(value) {
  if (!value) return null;
  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString();
}

function ensureStatus(value) {
  const allowed = new Set(Object.values(TASK_STATUSES));
  return allowed.has(value) ? value : TASK_STATUSES.PLANNED;
}

function ensurePriority(value) {
  if (value === null || value === undefined) {
    return TASK_PRIORITIES.MEDIUM;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return TASK_PRIORITIES.MEDIUM;
  }

  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return TASK_PRIORITIES.MEDIUM;
  }

  return Math.min(Math.max(numeric, TASK_PRIORITIES.CRITICAL), TASK_PRIORITIES.LOW);
}

function normaliseMetadata(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('Nepavyko normalizuoti užduoties metadata reikšmės:', error);
    return {};
  }
}

export class TaskManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? TASK_STORAGE_KEY;
    this.tasks = [];
    this.loadFromStorage();
  }

  loadFromStorage() {
    if (!isLocalStorageAvailable()) {
      this.tasks = [];
      return [];
    }

    const raw = localStorage.getItem(this.storageKey);
    const parsedTasks = safeParse(raw).map((task) => this.#normalizeTask(task));
    this.tasks = parsedTasks.filter(Boolean);
    return this.getTasks();
  }

  saveToStorage() {
    if (!isLocalStorageAvailable()) {
      return;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.tasks));
    } catch (error) {
      console.error('Nepavyko išsaugoti užduočių localStorage:', error);
    }
  }

  getTasks() {
    return sortTasksByPriorityAndDue(this.tasks);
  }

  filterTasks(filters = {}) {
    const searchTerm = (filters.search ?? '').toLowerCase().trim();
    const statusFilter = filters.status ?? 'all';
    const channelFilter = filters.channel ?? 'all';

    const filtered = this.getTasks().filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      if (channelFilter !== 'all' && task.channel !== channelFilter) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }

      const haystack = [
        task.type,
        task.typeLabel,
        task.description,
        task.responsible,
        task.channel,
        task.channelLabel,
        task.dueAt,
        task.seriesId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchTerm);
    });

    return mergeRecurringTasksForDisplay(filtered, { referenceDate: new Date() });
  }

  addTask(payload) {
    const timestamp = new Date().toISOString();
    const newTask = this.#normalizeTask({
      ...payload,
      id: payload.id ?? this.#generateId(),
      createdAt: payload.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    const exists = this.tasks.find((item) => item.id === newTask.id);
    if (exists) {
      Object.assign(exists, newTask, { createdAt: exists.createdAt ?? newTask.createdAt });
    } else {
      this.tasks.push(newTask);
    }

    this.saveToStorage();
    return exists ?? newTask;
  }

  updateTask(id, updates = {}) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) {
      return null;
    }

    const updated = this.#normalizeTask({
      ...task,
      ...updates,
      id,
      deadline: updates.deadline !== undefined ? updates.deadline : task.deadline,
      dueAt: updates.dueAt !== undefined ? updates.dueAt : task.dueAt,
      status: updates.status ? ensureStatus(updates.status) : task.status,
      createdAt: task.createdAt,
      updatedAt: new Date().toISOString(),
    });

    Object.assign(task, updated);
    this.saveToStorage();
    return task;
  }

  setStatus(id, status) {
    return this.updateTask(id, { status });
  }

  upsertTask(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const timestamp = new Date().toISOString();
    const candidate = this.#normalizeTask({
      ...payload,
      id: payload.id ?? this.#generateId(),
      createdAt: payload.createdAt ?? timestamp,
      updatedAt: payload.updatedAt ?? timestamp,
    });

    const existingIndex = this.tasks.findIndex((task) => task.id === candidate.id);
    if (existingIndex === -1) {
      this.tasks.push(candidate);
    } else {
      const existing = this.tasks[existingIndex];
      this.tasks[existingIndex] = {
        ...existing,
        ...candidate,
        createdAt: existing.createdAt ?? candidate.createdAt,
        updatedAt: candidate.updatedAt ?? timestamp,
      };
    }

    this.saveToStorage();
    return candidate;
  }

  hasTask(id) {
    if (!id) return false;
    return this.tasks.some((task) => task.id === id);
  }

  removeTask(id) {
    const originalLength = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.id !== id);
    if (this.tasks.length !== originalLength) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  clearAllTasks() {
    this.tasks = [];
    if (isLocalStorageAvailable()) {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        console.warn('Nepavyko pašalinti užduočių iš localStorage:', error);
      }
    }
  }

  #normalizeTask(task) {
    if (!task || typeof task !== 'object') {
      return null;
    }

    const createdAt = safeIsoString(task.createdAt) ?? new Date().toISOString();
    const updatedAt = safeIsoString(task.updatedAt) ?? createdAt;
    const dueAt = task.dueAt !== undefined ? safeIsoString(task.dueAt) : safeIsoString(task.deadline);

    return {
      id: typeof task.id === 'string' ? task.id : this.#generateId(),
      type: typeof task.type === 'string' ? task.type : 'general',
      typeLabel: typeof task.typeLabel === 'string' ? task.typeLabel : (task.type ?? 'general'),
      title: typeof task.title === 'string' ? task.title : null,
      description: typeof task.description === 'string' ? task.description : '',
      recurrence: typeof task.recurrence === 'string' ? task.recurrence : 'none',
      recurrenceLabel: typeof task.recurrenceLabel === 'string' ? task.recurrenceLabel : (task.recurrence ?? 'none'),
      responsible: typeof task.responsible === 'string' ? task.responsible : '',
      deadline: safeIsoString(task.deadline),
      dueAt,
      channel: typeof task.channel === 'string' ? task.channel : 'general',
      channelLabel: typeof task.channelLabel === 'string' ? task.channelLabel : (task.channel ?? 'general'),
      priority: ensurePriority(task.priority),
      status: ensureStatus(task.status),
      seriesId: typeof task.seriesId === 'string' ? task.seriesId : null,
      source: typeof task.source === 'string' ? task.source : (task.source === null ? null : 'local'),
      metadata: normaliseMetadata(task.metadata),
      createdAt,
      updatedAt,
    };
  }

  #generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${FALLBACK_ID_PREFIX}${Math.random().toString(36).slice(2, 11)}`;
  }
}

export default TaskManager;
