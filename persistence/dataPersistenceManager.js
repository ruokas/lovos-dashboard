import { BED_LAYOUT, STATUS_OPTIONS, PRIORITY_LEVELS } from '../models/bedData.js';
import { getSupabaseClient } from './supabaseClient.js';
import { getLastSupabaseUpdate } from './syncMetadataService.js';
import { parseSupabaseTimestamp } from '../utils/time.js';

const LOCAL_STORAGE_KEYS = {
  formResponses: 'bed-management-form-responses',
  occupancyData: 'bed-management-occupancy-data',
  lastSync: 'bed-management-last-sync',
  version: 'bed-management-data-version',
};

const DATA_VERSION = '2.0.0';
const MAX_LOCAL_ITEMS = 10000;

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
    const [formResponses, occupancyData, lastSync] = await Promise.all([
      this.loadFormResponses(),
      this.loadOccupancyData(),
      this.getLastSync(),
    ]);

    return JSON.stringify(
      {
        version: DATA_VERSION,
        exportTimestamp: new Date().toISOString(),
        formResponses,
        occupancyData,
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

    if (!this.#isSupabaseAvailable()) {
      saveLocalArray(LOCAL_STORAGE_KEYS.formResponses, data.formResponses);
      saveLocalArray(LOCAL_STORAGE_KEYS.occupancyData, data.occupancyData);
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
