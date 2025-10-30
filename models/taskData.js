const FALLBACK_ID_PREFIX = 'task-';
export const TASK_STORAGE_KEY = 'lovos-dashboard.tasks.v1';

export const TASK_STATUSES = {
  PLANNED: 'planned',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
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
    return [...this.tasks].sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline) : null;
      const bDeadline = b.deadline ? new Date(b.deadline) : null;

      const aHasDeadline = aDeadline instanceof Date && !Number.isNaN(aDeadline);
      const bHasDeadline = bDeadline instanceof Date && !Number.isNaN(bDeadline);

      if (aHasDeadline && bHasDeadline) {
        if (aDeadline.getTime() !== bDeadline.getTime()) {
          return aDeadline - bDeadline;
        }
      } else if (aHasDeadline) {
        return -1;
      } else if (bHasDeadline) {
        return 1;
      }

      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreated - bCreated;
    });
  }

  filterTasks(filters = {}) {
    const searchTerm = (filters.search ?? '').toLowerCase().trim();
    const statusFilter = filters.status ?? 'all';
    const channelFilter = filters.channel ?? 'all';

    return this.getTasks().filter((task) => {
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
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchTerm);
    });
  }

  addTask(payload) {
    const timestamp = new Date().toISOString();
    const newTask = {
      id: payload.id ?? this.#generateId(),
      type: payload.type ?? 'general',
      typeLabel: payload.typeLabel ?? payload.type ?? 'general',
      description: payload.description?.trim() ?? '',
      recurrence: payload.recurrence ?? 'none',
      recurrenceLabel: payload.recurrenceLabel ?? payload.recurrence ?? 'none',
      responsible: payload.responsible?.trim() ?? '',
      deadline: safeIsoString(payload.deadline),
      channel: payload.channel ?? 'general',
      channelLabel: payload.channelLabel ?? payload.channel ?? 'general',
      status: ensureStatus(payload.status),
      createdAt: payload.createdAt ? safeIsoString(payload.createdAt) ?? timestamp : timestamp,
      updatedAt: timestamp,
    };

    this.tasks.push(newTask);
    this.saveToStorage();
    return newTask;
  }

  updateTask(id, updates = {}) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) {
      return null;
    }

    const updated = {
      ...task,
      ...updates,
      deadline: updates.deadline !== undefined ? safeIsoString(updates.deadline) : task.deadline,
      status: updates.status ? ensureStatus(updates.status) : task.status,
      updatedAt: new Date().toISOString(),
    };

    Object.assign(task, updated);
    this.saveToStorage();
    return task;
  }

  setStatus(id, status) {
    return this.updateTask(id, { status });
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

    return {
      id: typeof task.id === 'string' ? task.id : this.#generateId(),
      type: typeof task.type === 'string' ? task.type : 'general',
      typeLabel: typeof task.typeLabel === 'string' ? task.typeLabel : (task.type ?? 'general'),
      description: typeof task.description === 'string' ? task.description : '',
      recurrence: typeof task.recurrence === 'string' ? task.recurrence : 'none',
      recurrenceLabel: typeof task.recurrenceLabel === 'string' ? task.recurrenceLabel : (task.recurrence ?? 'none'),
      responsible: typeof task.responsible === 'string' ? task.responsible : '',
      deadline: safeIsoString(task.deadline),
      channel: typeof task.channel === 'string' ? task.channel : 'general',
      channelLabel: typeof task.channelLabel === 'string' ? task.channelLabel : (task.channel ?? 'general'),
      status: ensureStatus(task.status),
      createdAt: safeIsoString(task.createdAt) ?? new Date().toISOString(),
      updatedAt: safeIsoString(task.updatedAt) ?? new Date().toISOString(),
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
