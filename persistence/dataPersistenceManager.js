import { BED_LAYOUT, STATUS_OPTIONS, PRIORITY_LEVELS } from '../models/bedData.js';
import { TaskData, TaskTemplate, TASK_STATUS } from '../models/taskData.js';
import { getSupabaseClient } from './supabaseClient.js';
import { getLastSupabaseUpdate } from './syncMetadataService.js';
import { parseSupabaseTimestamp } from '../utils/time.js';

const LOCAL_STORAGE_KEYS = {
  formResponses: 'bed-management-form-responses',
  occupancyData: 'bed-management-occupancy-data',
  lastSync: 'bed-management-last-sync',
  version: 'bed-management-data-version',
  tasks: 'bed-management-tasks',
  taskTemplates: 'bed-management-task-templates',
};

const DATA_VERSION = '2.1.0';
const MAX_LOCAL_ITEMS = 10000;
const MAX_LOCAL_TASK_ITEMS = 500;

const STATUS_PRIORITY_MAP = new Map([
  [STATUS_OPTIONS.MESSY_BED, PRIORITY_LEVELS.MESSY_BED],
  [STATUS_OPTIONS.MISSING_EQUIPMENT, PRIORITY_LEVELS.MISSING_EQUIPMENT],
  [STATUS_OPTIONS.OTHER, PRIORITY_LEVELS.OTHER_PROBLEM],
]);

function calculatePriority(status) {
  return STATUS_PRIORITY_MAP.get(status) ?? 0;
}

function createLocalArray(key) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Nepavyko nuskaityti localStorage:', error);
    return [];
  }
}

function saveLocalArray(key, value) {
  try {
    const safe = Array.isArray(value) ? value : [];
    localStorage.setItem(key, JSON.stringify(safe));
  } catch (error) {
    console.error('Nepavyko įrašyti localStorage:', error);
  }
}

function normalizeTaskHistoryEntry({
  type,
  status,
  description,
  createdAt,
  createdBy,
  metadata,
}) {
  return {
    type: type ?? 'updated',
    status: status ?? null,
    description: description ?? null,
    createdAt: normalizeIsoTimestamp(createdAt ?? new Date().toISOString()),
    createdBy: createdBy ?? null,
    metadata: { ...(metadata ?? {}) },
  };
}

function normalizeIsoTimestamp(value) {
  const parsed = parseSupabaseTimestamp(value);
  return parsed ? parsed.toISOString() : null;
}

function pickLatestTimestamp(existing, candidate) {
  const currentDate = existing ? new Date(existing) : null;
  const candidateDate = candidate ? new Date(candidate) : null;
  if (!candidateDate || Number.isNaN(candidateDate.getTime())) {
    return existing ?? null;
  }
  if (!currentDate || Number.isNaN(currentDate.getTime())) {
    return candidateDate.toISOString();
  }
  return candidateDate > currentDate ? candidateDate.toISOString() : currentDate.toISOString();
}

export class DataPersistenceManager {
  constructor(options = {}) {
    this.document = options.document;
    this.client = options.client ?? this.#createSupabaseClient(options.document);

    this.bedLabelToId = new Map();
    this.bedIdToLabel = new Map();
    this.bedsLoaded = false;
    this.lastSyncCache = null;
  }

  #createSupabaseClient(doc) {
    try {
      return getSupabaseClient(doc);
    } catch (error) {
      console.info('Nuotolinės paslaugos klientas nepasiekiamas, naudojamas localStorage režimas.', error);
      return null;
    }
  }

  #isSupabaseAvailable() {
    return Boolean(this.client);
  }

  async #ensureBedsLoaded() {
    if (!this.#isSupabaseAvailable() || this.bedsLoaded) {
      return;
    }

    const { data, error } = await this.client
      .from('beds')
      .select('id, label');

    if (error) {
      throw new Error(`Nepavyko gauti lovų sąrašo iš nuotolinės paslaugos: ${error.message}`);
    }

    data.forEach(({ id, label }) => {
      if (!id || !label) return;
      this.bedLabelToId.set(label, id);
      this.bedIdToLabel.set(id, label);
    });

    this.bedsLoaded = true;
  }

  async #resolveBedId(label) {
    await this.#ensureBedsLoaded();
    const bedId = this.bedLabelToId.get(label);
    if (!bedId) {
      throw new Error(`Nuotolinė paslauga nerado lovos pagal pavadinimą: ${label}`);
    }
    return bedId;
  }

  #resolveBedLabel(id) {
    return this.bedIdToLabel.get(id) ?? null;
  }

  async getBedLabelById(id) {
    await this.#ensureBedsLoaded();
    return this.#resolveBedLabel(id) ?? null;
  }

  #updateLocalLastSync(timestamp) {
    try {
      if (!timestamp) return;
      localStorage.setItem(LOCAL_STORAGE_KEYS.lastSync, timestamp);
    } catch (error) {
      console.warn('Nepavyko išsaugoti paskutinio sinchronizavimo localStorage:', error);
    }
  }

  async saveFormResponse(formResponse) {
    if (!formResponse) return false;

    if (!this.#isSupabaseAvailable()) {
      const responses = createLocalArray(LOCAL_STORAGE_KEYS.formResponses);
      responses.push(formResponse);
      if (responses.length > MAX_LOCAL_ITEMS) {
        responses.splice(0, responses.length - MAX_LOCAL_ITEMS);
      }
      saveLocalArray(LOCAL_STORAGE_KEYS.formResponses, responses);
      this.#updateLocalLastSync(formResponse.timestamp);
      this.lastSyncCache = formResponse.timestamp;
      return true;
    }

    await this.#ensureBedsLoaded();
    const bedId = await this.#resolveBedId(formResponse.bedId);

    const payload = {
      bed_id: bedId,
      status: formResponse.status,
      priority: calculatePriority(formResponse.status),
      notes: formResponse.description,
      reported_by: formResponse.email,
      metadata: {
        source: 'web_form',
        originalTimestamp: formResponse.timestamp,
      },
      created_at: formResponse.timestamp,
    };

    const { data, error } = await this.client
      .from('bed_status_events')
      .insert([payload])
      .select('id, created_at');

    if (error) {
      throw new Error(`Nepavyko išsaugoti lovos būsenos nuotolinėje paslaugoje: ${error.message}`);
    }

    const createdAt = data?.[0]?.created_at ?? formResponse.timestamp ?? new Date().toISOString();
    this.lastSyncCache = createdAt;
    return true;
  }

  async saveOccupancyData(occupancyData) {
    if (!occupancyData) return false;

    if (!this.#isSupabaseAvailable()) {
      const records = createLocalArray(LOCAL_STORAGE_KEYS.occupancyData);
      records.push(occupancyData);
      if (records.length > MAX_LOCAL_ITEMS) {
        records.splice(0, records.length - MAX_LOCAL_ITEMS);
      }
      saveLocalArray(LOCAL_STORAGE_KEYS.occupancyData, records);
      this.#updateLocalLastSync(occupancyData.timestamp);
      this.lastSyncCache = occupancyData.timestamp;
      return true;
    }

    await this.#ensureBedsLoaded();
    const bedId = await this.#resolveBedId(occupancyData.bedId);

    const payload = {
      bed_id: bedId,
      occupancy_state: occupancyData.status,
      patient_code: occupancyData.patientCode ?? null,
      expected_until: occupancyData.expectedUntil ?? null,
      notes: occupancyData.notes ?? null,
      created_by: occupancyData.createdBy ?? occupancyData.email ?? null,
      metadata: {
        source: 'web_form',
        originalTimestamp: occupancyData.timestamp,
      },
      created_at: occupancyData.timestamp,
    };

    const { data, error } = await this.client
      .from('occupancy_events')
      .insert([payload])
      .select('id, created_at');

    if (error) {
      throw new Error(`Nepavyko išsaugoti lovos užimtumo nuotolinėje paslaugoje: ${error.message}`);
    }

    const createdAt = data?.[0]?.created_at ?? occupancyData.timestamp ?? new Date().toISOString();
    this.lastSyncCache = createdAt;
    return true;
  }

  async loadTaskTemplates() {
    if (!this.#isSupabaseAvailable()) {
      return createLocalArray(LOCAL_STORAGE_KEYS.taskTemplates)
        .map((item) => new TaskTemplate(item));
    }

    const { data, error } = await this.client
      .from('task_templates')
      .select(`
        id,
        category,
        description,
        priority,
        status,
        due_at,
        recurrence,
        assigned_to,
        metadata,
        task_events (
          id,
          event_type,
          status,
          notes,
          created_by,
          metadata,
          created_at
        )
      `)
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`Nepavyko gauti užduočių šablonų iš nuotolinės paslaugos: ${error.message}`);
    }

    return (data ?? []).map((row) => TaskTemplate.fromSupabase(row));
  }

  async loadTasks() {
    if (!this.#isSupabaseAvailable()) {
      return createLocalArray(LOCAL_STORAGE_KEYS.tasks)
        .map((item) => new TaskData(item));
    }

    const { data, error } = await this.client
      .from('tasks')
      .select(`
        id,
        template_id,
        category,
        description,
        priority,
        status,
        due_at,
        recurrence,
        assigned_to,
        metadata,
        task_templates (
          id,
          category,
          description,
          priority,
          status,
          due_at,
          recurrence,
          assigned_to,
          metadata
        ),
        task_events (
          id,
          event_type,
          status,
          notes,
          created_by,
          metadata,
          created_at
        )
      `)
      .order('due_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`Nepavyko gauti užduočių iš nuotolinės paslaugos: ${error.message}`);
    }

    const tasks = (data ?? []).map((row) => TaskData.fromSupabase(row));

    let latest = null;
    tasks.forEach((task) => {
      task.history.forEach((event) => {
        latest = pickLatestTimestamp(latest, event.createdAt);
      });
    });

    if (latest) {
      this.lastSyncCache = latest;
    }

    return tasks;
  }

  async saveTask(taskLike, options = {}) {
    if (!taskLike) {
      throw new Error('Užduoties duomenys negali būti tušti');
    }

    const task = taskLike instanceof TaskData ? taskLike : new TaskData(taskLike);
    const eventType = options.eventType ?? (task.id ? 'updated' : 'created');
    const eventTimestamp = normalizeIsoTimestamp(options.eventTimestamp ?? new Date().toISOString())
      ?? new Date().toISOString();
    const eventNotes = options.notes ?? null;
    const eventCreatedBy = options.createdBy ?? task.assignedTo ?? null;
    const eventMetadata = {
      source: options.source ?? 'task_manager',
      ...(options.metadata ?? {}),
    };

    if (!this.#isSupabaseAvailable()) {
      const tasks = createLocalArray(LOCAL_STORAGE_KEYS.tasks);
      const taskId = task.id ?? `local-task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
      const storedTask = new TaskData({
        ...task.toJSON(),
        id: taskId,
        history: [
          ...task.history,
          normalizeTaskHistoryEntry({
            type: eventType,
            status: task.status,
            description: eventNotes,
            createdAt: eventTimestamp,
            createdBy: eventCreatedBy,
            metadata: eventMetadata,
          }),
        ],
      });

      const index = tasks.findIndex((existing) => existing?.id === taskId);
      const payload = storedTask.toJSON();
      if (index >= 0) {
        tasks[index] = payload;
      } else {
        tasks.push(payload);
      }

      if (tasks.length > MAX_LOCAL_TASK_ITEMS) {
        tasks.splice(0, tasks.length - MAX_LOCAL_TASK_ITEMS);
      }

      saveLocalArray(LOCAL_STORAGE_KEYS.tasks, tasks);
      this.#updateLocalLastSync(eventTimestamp);
      this.lastSyncCache = eventTimestamp;
      return taskId;
    }

    const taskPayload = {
      id: task.id ?? undefined,
      template_id: task.templateId ?? task.metadata?.template?.id ?? null,
      category: task.category,
      description: task.description,
      priority: task.priority ?? 0,
      status: task.status ?? TASK_STATUS.PENDING,
      due_at: task.dueAt ?? null,
      recurrence: task.recurrence ?? null,
      assigned_to: task.assignedTo ?? null,
      metadata: { ...(task.metadata ?? {}) },
    };

    const upsert = this.client
      .from('tasks')
      .upsert([taskPayload], { onConflict: 'id', defaultToNull: false })
      .select('id');

    const { data, error } = await upsert;
    if (error) {
      throw new Error(`Nepavyko išsaugoti užduoties nuotolinėje paslaugoje: ${error.message}`);
    }

    const savedId = data?.[0]?.id ?? task.id;

    const eventPayload = {
      task_id: savedId,
      event_type: eventType,
      status: task.status ?? TASK_STATUS.PENDING,
      notes: eventNotes,
      created_by: eventCreatedBy,
      metadata: eventMetadata,
      created_at: eventTimestamp,
    };

    const { data: eventData, error: eventError } = await this.client
      .from('task_events')
      .insert([eventPayload])
      .select('created_at');

    if (eventError) {
      throw new Error(`Nepavyko įrašyti užduoties istorijos: ${eventError.message}`);
    }

    const createdAt = eventData?.[0]?.created_at ?? eventTimestamp;
    this.lastSyncCache = createdAt;
    return savedId;
  }

  async completeTask(taskId, options = {}) {
    if (!taskId) {
      throw new Error('Nenurodytas užduoties identifikatorius');
    }

    const timestamp = normalizeIsoTimestamp(options.completedAt ?? new Date().toISOString())
      ?? new Date().toISOString();

    if (!this.#isSupabaseAvailable()) {
      const tasks = createLocalArray(LOCAL_STORAGE_KEYS.tasks);
      const index = tasks.findIndex((item) => item?.id === taskId);
      if (index === -1) {
        return false;
      }

      const existing = new TaskData(tasks[index]);
      const updated = new TaskData({
        ...existing.toJSON(),
        status: TASK_STATUS.COMPLETED,
        history: [
          ...existing.history,
          normalizeTaskHistoryEntry({
            type: 'completed',
            status: TASK_STATUS.COMPLETED,
            description: options.notes ?? null,
            createdAt: timestamp,
            createdBy: options.completedBy ?? null,
            metadata: { source: 'task_manager', ...(options.metadata ?? {}) },
          }),
        ],
      });

      tasks[index] = updated.toJSON();
      saveLocalArray(LOCAL_STORAGE_KEYS.tasks, tasks);
      this.#updateLocalLastSync(timestamp);
      this.lastSyncCache = timestamp;
      return true;
    }

    const { error } = await this.client
      .from('tasks')
      .update({ status: TASK_STATUS.COMPLETED })
      .eq('id', taskId);

    if (error) {
      throw new Error(`Nepavyko užbaigti užduoties nuotolinėje paslaugoje: ${error.message}`);
    }

    const eventPayload = {
      task_id: taskId,
      event_type: 'completed',
      status: TASK_STATUS.COMPLETED,
      notes: options.notes ?? null,
      created_by: options.completedBy ?? null,
      metadata: { source: 'task_manager', ...(options.metadata ?? {}) },
      created_at: timestamp,
    };

    const { data, error: eventError } = await this.client
      .from('task_events')
      .insert([eventPayload])
      .select('created_at');

    if (eventError) {
      throw new Error(`Nepavyko įrašyti užduoties užbaigimo įvykių: ${eventError.message}`);
    }

    const createdAt = data?.[0]?.created_at ?? timestamp;
    this.lastSyncCache = createdAt;
    return true;
  }

  async loadAggregatedBedState() {
    if (!this.#isSupabaseAvailable()) {
      return this.#buildLocalAggregatedState();
    }

    await this.#ensureBedsLoaded();
    const columnDefinitions = [
      { key: 'bed_id', select: 'bed_id' },
      { key: 'label', select: 'label' },
      { key: 'status', select: 'status' },
      { key: 'priority', select: 'priority' },
      { key: 'status_notes', select: 'status_notes' },
      {
        key: 'status_reported_by',
        select: 'status_reported_by',
        optional: true,
        fallbacks: ['status_reported_by:reported_by'],
      },
      { key: 'status_metadata', select: 'status_metadata', optional: true },
      { key: 'status_created_at', select: 'status_created_at' },
      { key: 'occupancy_state', select: 'occupancy_state' },
      { key: 'patient_code', select: 'patient_code' },
      { key: 'expected_until', select: 'expected_until' },
      { key: 'occupancy_notes', select: 'occupancy_notes' },
      {
        key: 'occupancy_created_by',
        select: 'occupancy_created_by',
        optional: true,
        fallbacks: ['occupancy_created_by:created_by'],
      },
      {
        key: 'occupancy_metadata',
        select: 'occupancy_metadata',
        optional: true,
        fallbacks: ['occupancy_metadata:metadata'],
        missingNotice: {
          fallback: {
            level: 'info',
            message: ({ missingColumn, column }) =>
              `aggregated_bed_state view neturi stulpelio ${missingColumn}, mėginamas suderinamumo alias (${column.activeSelect}). Tai normalu, jei nuotolinės paslaugos vaizde nenaudojate papildomų metaduomenų.`,
          },
          optional: {
            level: 'info',
            message: ({ missingColumn, column }) =>
              `aggregated_bed_state view neturi stulpelio ${missingColumn} (lauko ${column.key}), tęsiama be šios informacijos (tai normalu, jei nuotolinės paslaugos vaizde neįjungti metaduomenys).`,
          },
        },
      },
      { key: 'occupancy_created_at', select: 'occupancy_created_at' },
    ];

    const activeColumns = columnDefinitions.map((column) => ({
      ...column,
      activeSelect: column.select,
      remainingFallbacks: Array.isArray(column.fallbacks) ? [...column.fallbacks] : [],
    }));

    const missingColumnRegex = /column\s+aggregated_bed_state\.\"?([a-zA-Z0-9_]+)\"?\s+does\s+not\s+exist/i;

    const defaultMissingMessages = {
      fallback: (columnName) =>
        `aggregated_bed_state view neturi stulpelio ${columnName}, pritaikytas suderinamumo alias. Atnaujinkite nuotolinės paslaugos migracijas.`,
      optional: (columnName) =>
        `aggregated_bed_state view neturi stulpelio ${columnName}, tęsiama be šios informacijos. Atnaujinkite nuotolinės paslaugos migracijas.`,
    };

    const logMissingColumn = (column, missingColumn, phase) => {
      const config = column?.missingNotice?.[phase];
      if (config === null) {
        return;
      }

      const level = config?.level ?? 'warn';
      const logger = typeof console[level] === 'function' ? console[level].bind(console) : console.warn.bind(console);

      let message;
      if (typeof config?.message === 'function') {
        message = config.message({ missingColumn, phase, column });
      } else if (typeof config?.message === 'string') {
        message = config.message.includes('{{column}}')
          ? config.message.replace('{{column}}', missingColumn)
          : config.message;
      }

      const finalMessage = message ?? defaultMissingMessages[phase](missingColumn);
      if (finalMessage) {
        logger(finalMessage);
      }
    };

    const resolveActualColumn = (expression) => {
      if (!expression) {
        return null;
      }
      const parts = expression.split(':');
      return parts[parts.length - 1].trim();
    };

    const buildSelectClause = () =>
      activeColumns
        .map((column) => column.activeSelect)
        .filter(Boolean)
        .join(', ');

    let data = null;
    let error = null;

    while (true) {
      ({ data, error } = await this.client
        .from('aggregated_bed_state')
        .select(buildSelectClause()));

      if (!error) {
        break;
      }

      const message = error.message ?? '';
      const match = message.match(missingColumnRegex);
      const missingColumn = match?.[1] ?? null;

      if (!missingColumn) {
        throw new Error(`Nepavyko gauti suvestinės iš nuotolinės paslaugos: ${error.message}`);
      }

      const target = activeColumns.find((column) => resolveActualColumn(column.activeSelect) === missingColumn);

      if (!target) {
        throw new Error(`Nepavyko gauti suvestinės iš nuotolinės paslaugos: ${error.message}`);
      }

      if (target.remainingFallbacks.length > 0) {
        target.activeSelect = target.remainingFallbacks.shift();
        logMissingColumn(target, missingColumn, 'fallback');
        continue;
      }

      if (target.optional) {
        logMissingColumn(target, missingColumn, 'optional');
        target.activeSelect = null;
        continue;
      }

      throw new Error(`Nepavyko gauti suvestinės iš nuotolinės paslaugos: ${error.message}`);
    }

    const aggregated = (data ?? [])
      .map((row) => {
        const bedLabel = row.label ?? this.#resolveBedLabel(row.bed_id) ?? null;
        if (!bedLabel) {
          return null;
        }

        const statusCreatedAt = normalizeIsoTimestamp(row.status_created_at);
        const occupancyCreatedAt = normalizeIsoTimestamp(row.occupancy_created_at);

        return {
          bedId: bedLabel,
          bedUuid: row.bed_id ?? null,
          status: row.status ?? null,
          statusNotes: row.status_notes ?? row.status_metadata?.description ?? null,
          priority: typeof row.priority === 'number' ? row.priority : calculatePriority(row.status),
          statusReportedBy: row.status_reported_by ?? null,
          statusCreatedAt,
          statusMetadata: row.status_metadata ?? {},
          occupancyState: row.occupancy_state ?? null,
          patientCode: row.patient_code ?? null,
          expectedUntil: row.expected_until ?? null,
          occupancyNotes: row.occupancy_notes ?? null,
          occupancyCreatedBy: row.occupancy_created_by ?? null,
          occupancyCreatedAt,
          occupancyMetadata: row.occupancy_metadata ?? {},
        };
      })
      .filter(Boolean);

    let latest = null;
    aggregated.forEach((record) => {
      latest = pickLatestTimestamp(latest, record.statusCreatedAt);
      latest = pickLatestTimestamp(latest, record.occupancyCreatedAt);
    });

    if (latest) {
      this.lastSyncCache = latest;
    }

    return aggregated;
  }

  #buildLocalAggregatedState() {
    const formResponses = createLocalArray(LOCAL_STORAGE_KEYS.formResponses);
    const occupancyRecords = createLocalArray(LOCAL_STORAGE_KEYS.occupancyData);

    const latestStatus = new Map();
    formResponses.forEach((response) => {
      const bedId = response?.bedId;
      if (!bedId) return;
      const timestamp = normalizeIsoTimestamp(response.timestamp);
      const existing = latestStatus.get(bedId);
      const existingTimestamp = existing?.timestamp ?? null;
      const chosen = pickLatestTimestamp(existingTimestamp, timestamp);
      if (!existing || chosen !== existingTimestamp) {
        latestStatus.set(bedId, { ...response, timestamp: chosen ?? timestamp });
      }
    });

    const latestOccupancy = new Map();
    occupancyRecords.forEach((record) => {
      const bedId = record?.bedId;
      if (!bedId) return;
      const timestamp = normalizeIsoTimestamp(record.timestamp);
      const existing = latestOccupancy.get(bedId);
      const existingTimestamp = existing?.timestamp ?? null;
      const chosen = pickLatestTimestamp(existingTimestamp, timestamp);
      if (!existing || chosen !== existingTimestamp) {
        latestOccupancy.set(bedId, { ...record, timestamp: chosen ?? timestamp });
      }
    });

    const aggregated = [];
    const bedIds = new Set([
      ...BED_LAYOUT,
      ...latestStatus.keys(),
      ...latestOccupancy.keys(),
    ]);

    let latest = null;
    bedIds.forEach((bedId) => {
      const statusRecord = latestStatus.get(bedId) ?? null;
      const occupancyRecord = latestOccupancy.get(bedId) ?? null;
      const statusCreatedAt = statusRecord ? normalizeIsoTimestamp(statusRecord.timestamp) : null;
      const occupancyCreatedAt = occupancyRecord ? normalizeIsoTimestamp(occupancyRecord.timestamp) : null;

      latest = pickLatestTimestamp(latest, statusCreatedAt);
      latest = pickLatestTimestamp(latest, occupancyCreatedAt);

      aggregated.push({
        bedId,
        bedUuid: null,
        status: statusRecord?.status ?? null,
        statusNotes: statusRecord?.description ?? null,
        priority: statusRecord?.priority ?? calculatePriority(statusRecord?.status),
        statusReportedBy: statusRecord?.email ?? null,
        statusCreatedAt,
        statusMetadata: statusRecord?.metadata ?? {},
        occupancyState: occupancyRecord?.status ?? null,
        patientCode: occupancyRecord?.patientCode ?? null,
        expectedUntil: occupancyRecord?.expectedUntil ?? null,
        occupancyNotes: occupancyRecord?.notes ?? null,
        occupancyCreatedBy: occupancyRecord?.createdBy ?? occupancyRecord?.email ?? null,
        occupancyCreatedAt,
        occupancyMetadata: occupancyRecord?.metadata ?? {},
      });
    });

    if (latest) {
      this.#updateLocalLastSync(latest);
      this.lastSyncCache = latest;
    }

    return aggregated;
  }

  async loadFormResponses() {
    if (!this.#isSupabaseAvailable()) {
      return createLocalArray(LOCAL_STORAGE_KEYS.formResponses);
    }

    await this.#ensureBedsLoaded();
    const { data, error } = await this.client
      .from('bed_status_events')
      .select('id, bed_id, status, priority, notes, reported_by, metadata, created_at, beds(label)')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Nepavyko gauti lovų būsenų nuotolinėje paslaugoje: ${error.message}`);
    }

    const mapped = (data ?? []).map((item) => ({
      id: item.id,
      timestamp: item.created_at,
      email: item.reported_by ?? null,
      bedId: item.beds?.label ?? this.#resolveBedLabel(item.bed_id) ?? 'Nežinoma lova',
      status: item.status,
      description: item.notes ?? item.metadata?.description ?? null,
      priority: item.priority ?? calculatePriority(item.status),
      metadata: item.metadata ?? {},
    }));

    const latestTimestamp = mapped[mapped.length - 1]?.timestamp;
    if (latestTimestamp) {
      this.lastSyncCache = latestTimestamp;
    }

    return mapped;
  }

  async loadOccupancyData() {
    if (!this.#isSupabaseAvailable()) {
      return createLocalArray(LOCAL_STORAGE_KEYS.occupancyData);
    }

    await this.#ensureBedsLoaded();
    const { data, error } = await this.client
      .from('occupancy_events')
      .select('id, bed_id, occupancy_state, patient_code, expected_until, notes, created_by, metadata, created_at, beds(label)')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Nepavyko gauti lovų užimtumo nuotolinėje paslaugoje: ${error.message}`);
    }

    const mapped = (data ?? []).map((item) => ({
      id: item.id,
      timestamp: item.created_at,
      bedId: item.beds?.label ?? this.#resolveBedLabel(item.bed_id) ?? 'Nežinoma lova',
      status: item.occupancy_state,
      patientCode: item.patient_code ?? null,
      expectedUntil: item.expected_until ?? null,
      notes: item.notes ?? null,
      createdBy: item.created_by ?? null,
      metadata: item.metadata ?? {},
    }));

    const latestTimestamp = mapped[mapped.length - 1]?.timestamp;
    if (latestTimestamp) {
      this.lastSyncCache = latestTimestamp;
    }

    return mapped;
  }

  async exportData() {
    const [formResponses, occupancyData, tasks, taskTemplates, lastSync] = await Promise.all([
      this.loadFormResponses(),
      this.loadOccupancyData(),
      this.loadTasks(),
      this.loadTaskTemplates(),
      this.getLastSync(),
    ]);

    return JSON.stringify(
      {
        version: DATA_VERSION,
        exportTimestamp: new Date().toISOString(),
        formResponses,
        occupancyData,
        tasks: tasks.map((task) => (task instanceof TaskData ? task.toJSON() : task)),
        taskTemplates: taskTemplates.map((template) => (
          template instanceof TaskTemplate ? template.toJSON() : template
        )),
        lastSync,
      },
      null,
      2,
    );
  }

  async downloadData() {
    const data = await this.exportData();
    if (!data) {
      throw new Error('Nėra duomenų eksportui');
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bed-management-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importData(jsonData) {
    const data = JSON.parse(jsonData);
    if (!data.version || !Array.isArray(data.formResponses) || !Array.isArray(data.occupancyData)) {
      throw new Error('Importuojamas failas neatitinka struktūros');
    }

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const taskTemplates = Array.isArray(data.taskTemplates) ? data.taskTemplates : [];

    if (!this.#isSupabaseAvailable()) {
      saveLocalArray(LOCAL_STORAGE_KEYS.formResponses, data.formResponses);
      saveLocalArray(LOCAL_STORAGE_KEYS.occupancyData, data.occupancyData);
      saveLocalArray(LOCAL_STORAGE_KEYS.tasks, tasks);
      saveLocalArray(LOCAL_STORAGE_KEYS.taskTemplates, taskTemplates);
      if (data.lastSync) {
        this.#updateLocalLastSync(data.lastSync);
        this.lastSyncCache = data.lastSync;
      }
      localStorage.setItem(LOCAL_STORAGE_KEYS.version, data.version);
      return true;
    }

    await this.#ensureBedsLoaded();

    if (data.formResponses.length > 0) {
      const statusPayload = await Promise.all(
        data.formResponses.map(async (response) => ({
          id: response.id ?? undefined,
          bed_id: await this.#resolveBedId(response.bedId),
          status: response.status,
          priority: calculatePriority(response.status),
          notes: response.description ?? null,
          reported_by: response.email ?? null,
          metadata: {
            ...(response.metadata ?? {}),
            importedAt: new Date().toISOString(),
          },
          created_at: response.timestamp ?? new Date().toISOString(),
        })),
      );

      const { error } = await this.client
        .from('bed_status_events')
        .insert(statusPayload);

      if (error) {
        throw new Error(`Nepavyko importuoti būsenų į nuotolinę paslaugą: ${error.message}`);
      }
    }

    if (data.occupancyData.length > 0) {
      const occupancyPayload = await Promise.all(
        data.occupancyData.map(async (record) => ({
          id: record.id ?? undefined,
          bed_id: await this.#resolveBedId(record.bedId),
          occupancy_state: record.status,
          patient_code: record.patientCode ?? null,
          expected_until: record.expectedUntil ?? null,
          notes: record.notes ?? null,
          created_by: record.createdBy ?? null,
          metadata: {
            ...(record.metadata ?? {}),
            importedAt: new Date().toISOString(),
          },
          created_at: record.timestamp ?? new Date().toISOString(),
        })),
      );

      const { error } = await this.client
        .from('occupancy_events')
        .insert(occupancyPayload);

      if (error) {
        throw new Error(`Nepavyko importuoti užimtumo į nuotolinę paslaugą: ${error.message}`);
      }
    }

    const now = new Date().toISOString();

    if (taskTemplates.length > 0) {
      const templatePayload = taskTemplates.map((template) => ({
        id: template.id ?? undefined,
        category: template.category ?? 'general',
        description: template.description ?? '',
        priority: template.priority ?? 0,
        status: template.status ?? 'active',
        due_at: template.dueAt ?? null,
        recurrence: template.recurrence ?? null,
        assigned_to: template.assignedTo ?? null,
        metadata: { ...(template.metadata ?? {}), importedAt: now },
      }));

      const { error: templateError } = await this.client
        .from('task_templates')
        .upsert(templatePayload, { onConflict: 'id', defaultToNull: false });

      if (templateError) {
        throw new Error(`Nepavyko importuoti užduočių šablonų: ${templateError.message}`);
      }
    }

    if (tasks.length > 0) {
      const taskPayload = tasks.map((task) => ({
        id: task.id ?? undefined,
        template_id: task.templateId ?? task.metadata?.template?.id ?? null,
        category: task.category ?? 'general',
        description: task.description ?? '',
        priority: task.priority ?? 0,
        status: task.status ?? TASK_STATUS.PENDING,
        due_at: task.dueAt ?? null,
        recurrence: task.recurrence ?? null,
        assigned_to: task.assignedTo ?? null,
        metadata: { ...(task.metadata ?? {}), importedAt: now },
      }));

      const { error: taskError } = await this.client
        .from('tasks')
        .upsert(taskPayload, { onConflict: 'id', defaultToNull: false });

      if (taskError) {
        throw new Error(`Nepavyko importuoti užduočių: ${taskError.message}`);
      }

      const taskEvents = tasks
        .flatMap((task) => {
          if (!Array.isArray(task.history) || !task.id) {
            return [];
          }
          return task.history.map((event) => ({
            id: event.id ?? undefined,
            task_id: task.id,
            event_type: event.type ?? 'updated',
            status: event.status ?? task.status ?? TASK_STATUS.PENDING,
            notes: event.description ?? null,
            created_by: event.createdBy ?? null,
            metadata: { ...(event.metadata ?? {}), importedAt: now },
            created_at: event.createdAt ?? now,
          }));
        })
        .filter((event) => event.task_id);

      if (taskEvents.length > 0) {
        const { error: eventError } = await this.client
          .from('task_events')
          .insert(taskEvents);

        if (eventError) {
          throw new Error(`Nepavyko importuoti užduočių įvykių: ${eventError.message}`);
        }
      }
    }

    this.lastSyncCache = data.lastSync ?? new Date().toISOString();
    return true;
  }

  async uploadData(file) {
    const fileContent = await file.text();
    return this.importData(fileContent);
  }

  async clearAllData() {
    if (!this.#isSupabaseAvailable()) {
      Object.values(LOCAL_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
      this.lastSyncCache = null;
      return true;
    }

    const deleteStatus = await this.client
      .from('bed_status_events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteStatus.error) {
      throw new Error(`Nepavyko išvalyti būsenų nuotolinėje paslaugoje: ${deleteStatus.error.message}`);
    }

    const deleteOccupancy = await this.client
      .from('occupancy_events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteOccupancy.error) {
      throw new Error(`Nepavyko išvalyti užimtumo nuotolinėje paslaugoje: ${deleteOccupancy.error.message}`);
    }

    const deleteTaskEvents = await this.client
      .from('task_events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteTaskEvents.error) {
      throw new Error(`Nepavyko išvalyti užduočių įvykių nuotolinėje paslaugoje: ${deleteTaskEvents.error.message}`);
    }

    const deleteTasks = await this.client
      .from('tasks')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteTasks.error) {
      throw new Error(`Nepavyko išvalyti užduočių nuotolinėje paslaugoje: ${deleteTasks.error.message}`);
    }

    const deleteTemplates = await this.client
      .from('task_templates')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteTemplates.error) {
      throw new Error(`Nepavyko išvalyti užduočių šablonų nuotolinėje paslaugoje: ${deleteTemplates.error.message}`);
    }

    this.lastSyncCache = null;
    return true;
  }

  async getLastSync() {
    if (!this.#isSupabaseAvailable()) {
      try {
        return this.lastSyncCache ?? localStorage.getItem(LOCAL_STORAGE_KEYS.lastSync);
      } catch (error) {
        console.warn('Nepavyko nuskaityti localStorage paskutinio sinchronizavimo:', error);
        return null;
      }
    }

    if (this.lastSyncCache) {
      return this.lastSyncCache;
    }

    try {
      const timestamp = await getLastSupabaseUpdate(this.client);
      this.lastSyncCache = timestamp;
      return timestamp;
    } catch (error) {
      console.error('Nepavyko gauti paskutinio nuotolinės paslaugos atnaujinimo:', error);
      return null;
    }
  }

  setClient(client) {
    this.client = client ?? null;
    this.bedsLoaded = false;
    this.bedLabelToId.clear();
    this.bedIdToLabel.clear();
    if (!this.#isSupabaseAvailable()) {
      this.lastSyncCache = null;
    }
  }

  needsMigration() {
    if (this.#isSupabaseAvailable()) {
      return false;
    }

    try {
      const storedVersion = localStorage.getItem(LOCAL_STORAGE_KEYS.version);
      return storedVersion !== DATA_VERSION;
    } catch (error) {
      console.error('Nepavyko patikrinti migracijos būsenos:', error);
      return false;
    }
  }

  async migrateData() {
    if (this.#isSupabaseAvailable()) {
      return false;
    }

    try {
      localStorage.setItem(LOCAL_STORAGE_KEYS.version, DATA_VERSION);
      return true;
    } catch (error) {
      console.error('Nepavyko atnaujinti localStorage versijos:', error);
      return false;
    }
  }
}
