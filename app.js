/**
 * Main application controller for bed cleanliness management system
 */

import { BedDataManager, DEFAULT_BED_LAYOUT, STATUS_OPTIONS } from './models/bedData.js';
import { SettingsManager, SettingsUI } from './settings/settingsManager.js';
import { BedStatusForm, OccupancyForm } from './forms/bedStatusForm.js';
import { TaskForm } from './forms/taskForm.js';
import { NotificationManager } from './notifications/notificationManager.js';
import { DataPersistenceManager } from './persistence/dataPersistenceManager.js';
import { UserInteractionLogger } from './analytics/userInteractionLogger.js';
import { NfcHandler } from './nfc/nfcHandler.js';
import { ReportingService } from './reports/reportingService.js';
import { SupabaseAuthManager } from './auth/supabaseAuth.js';
import { t, texts } from './texts.js';
import { TaskManager, TASK_STATUSES, TASK_ZONE_OPTIONS, TASK_PRIORITIES } from './models/taskData.js';
import { loadData as loadCsvData, rowsToOccupancyEvents } from './data.js';
import { clampFontSizeLevel, readStoredFontSizeLevel, storeFontSizeLevel, applyFontSizeLevelToDocument } from './utils/fontSize.js';
import { materializeRecurringTasks, DEFAULT_RECURRING_TEMPLATES } from './utils/taskScheduler.js';

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const VIEW_MODE_STORAGE_KEY = 'bedViewMode';
const BED_LIST_VISIBILITY_KEY = 'bedListVisible';
const SEARCH_DEBOUNCE_MS = 150;
const TASK_SEARCH_DEBOUNCE_MS = 200;

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export class BedManagementApp {
  constructor() {
    this.bedDataManager = new BedDataManager({ bedLayout: DEFAULT_BED_LAYOUT });
    this.settingsManager = new SettingsManager();
    this.document = typeof document !== 'undefined' ? document : undefined;
    this.fontSizeLevel = readStoredFontSizeLevel();
    applyFontSizeLevelToDocument(this.fontSizeLevel, this.document);
    this.viewMode = this.readViewMode();
    this.isGridView = this.viewMode === 'grid';
    this.isBedListVisible = this.readBedListVisibility();
    this.currentSearchTerm = '';
    this.searchDebounceTimer = null;
    this.persistenceManager = new DataPersistenceManager({ document: this.document });
    this.notificationManager = new NotificationManager(this.settingsManager, {
      fontSizeLevel: this.fontSizeLevel,
      onTaskComplete: this.handleNotificationTaskCompletion.bind(this),
    });
    this.taskManager = new TaskManager();
    const sharedDocument = this.document;
    this.reportingService = new ReportingService({
      client: this.persistenceManager.client,
      bedDataManager: this.bedDataManager,
      notificationManager: this.notificationManager,
      settings: this.settingsManager.getSettings(),
      taskManager: this.taskManager,
    });
    this.userInteractionLogger = new UserInteractionLogger({ document: sharedDocument, client: this.persistenceManager.client });

    this.taskFilters = { search: '', status: 'all', zone: 'all' };
    this.taskSearchDebounceTimer = null;
    this.boundTaskShortcutHandler = (event) => this.handleTaskShortcut(event);

    this.authManager = new SupabaseAuthManager({
      client: this.persistenceManager.client,
      document: sharedDocument,
      onAuthStateChanged: (session, context) => {
        void this.handleAuthStateChange(session, context);
      },
    });

    this.supabaseConfig = { url: '', anonKey: '' };
    this.isAuthenticated = false;

    const initialBedLayout = this.bedDataManager.getBedLayout();
    this.bedStatusForm = new BedStatusForm((formResponse) => this.handleFormResponse(formResponse), {
      logger: this.userInteractionLogger,
      bedLayout: initialBedLayout,
    });
    this.taskForm = new TaskForm((taskPayload) => this.handleTaskCreated(taskPayload), {
      logger: this.userInteractionLogger,
    });
    this.occupancyForm = new OccupancyForm((occupancyData) => this.handleOccupancyData(occupancyData), {
      bedLayout: initialBedLayout,
    });
    this.settingsUI = new SettingsUI(
      this.settingsManager,
      (settings) => this.handleSettingsChange(settings),
      {
        onClearLocalData: () => { void this.handleLocalDataClear(); },
      },
    );

    this.refreshInterval = null;
    this.isInitialized = false;
    this.nfcHandler = null;
    this.realtimeChannel = null;
    this.taskRealtimeChannel = null;
    this.usingCsvOccupancy = false;
    this.isSyncingCsvOccupancy = false;
  }

  syncFormsWithLayout() {
    const layout = this.bedDataManager.getBedLayout();
    if (this.bedStatusForm?.setBedLayout) {
      this.bedStatusForm.setBedLayout(layout);
    }
    if (this.occupancyForm?.setBedLayout) {
      this.occupancyForm.setBedLayout(layout);
    }
  }

  async loadRemoteBedLayout() {
    if (typeof this.persistenceManager?.loadBedLayout !== 'function') {
      this.syncFormsWithLayout();
      return;
    }

    try {
      const remoteLayout = await this.persistenceManager.loadBedLayout();
      if (Array.isArray(remoteLayout) && remoteLayout.length > 0) {
        this.bedDataManager.setBedLayout(remoteLayout);
      }
    } catch (error) {
      console.warn('Nepavyko gauti lovų sąrašo iš nuotolinės paslaugos:', error);
    } finally {
      this.syncFormsWithLayout();
    }
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Read nuotolinės paslaugos konfigūraciją iš HTML data atributų
      this.supabaseConfig = this.readSupabaseConfig();
      if (this.reportingService) {
        this.reportingService.setClient(this.persistenceManager.client);
      }

      if (this.authManager) {
        this.authManager.setClient(this.persistenceManager.client);
        const authResult = await this.ensureAuthentication();
        this.isAuthenticated = authResult?.status === 'authenticated';
      }

      await this.loadRemoteBedLayout();

      // Load saved data
      await this.loadSavedData();

      // Sugeneruokite suplanuotas laboratorijos užduotis prieš paleidžiant signalus
      this.refreshRecurringTasks();

      // Mark current notifications as jau matytos, kad realaus laiko įvykiai neskambėtų du kartus
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        suppressAlerts: true,
        fontSizeLevel: this.fontSizeLevel,
      });

      // Initialize NFC ir URL srautus
      await this.initNfcFlow();

      // Setup UI event listeners
      this.setupEventListeners();
      this.applyBedListVisibility();
      this.updateViewToggleButton();

      // Initial render
      await this.render();

      // Subscribe to nuotolinės paslaugos real-time, jei pasiekiama
      await this.subscribeToRealtimeUpdates();

      // Start auto-refresh
      this.startAutoRefresh();

      this.isInitialized = true;
      console.log('Bed Management App initialized successfully');
      void this.userInteractionLogger.logInteraction('app_initialized', {
        payload: { initializedAt: new Date().toISOString() },
      });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Nepavyko inicializuoti programos');
    }
  }

  async subscribeToRealtimeUpdates() {
    const client = this.persistenceManager?.client;
    if (!client || typeof client.channel !== 'function') {
      console.info('Nuotolinės paslaugos realaus laiko kanalas neaktyvus.');
      return;
    }

    if (this.realtimeChannel) {
      try {
        await this.realtimeChannel.unsubscribe();
      } catch (error) {
        console.warn('Nepavyko atsisakyti seno realaus laiko kanalo:', error);
      }
    }

    const channel = client.channel('public:bed-events');

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bed_status_events' }, (payload) => {
        if (!payload?.new) return;
        void this.handleRealtimeStatusEvent(payload.new, payload.eventType ?? payload.type ?? 'INSERT');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ed_board' }, (payload) => {
        if (!payload?.new) return;
        void this.handleRealtimeOccupancyEvent(payload.new, payload.eventType ?? payload.type ?? 'INSERT');
      });

    const status = await channel.subscribe();
    if (status === 'SUBSCRIBED') {
      console.log('Prisijungta prie realaus laiko atnaujinimų.');
    }

    this.realtimeChannel = channel;

    if (this.taskRealtimeChannel) {
      try {
        await this.taskRealtimeChannel.unsubscribe();
      } catch (error) {
        console.warn('Nepavyko atsisakyti seno užduočių realaus laiko kanalo:', error);
      }
    }

    const taskChannel = client.channel('public:tasks');
    taskChannel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        const record = payload?.new ?? payload?.old;
        if (!record) return;
        void this.handleRealtimeTask(record, payload.eventType ?? payload.type ?? 'INSERT');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_events' }, (payload) => {
        const record = payload?.new ?? payload?.old;
        if (!record) return;
        void this.handleRealtimeTaskEvent(record, payload.eventType ?? payload.type ?? 'INSERT');
      });

    const taskStatus = await taskChannel.subscribe();
    if (taskStatus === 'SUBSCRIBED') {
      console.log('Prisijungta prie bendrų užduočių realaus laiko kanalo.');
    }

    this.taskRealtimeChannel = taskChannel;
  }

  async ensureAuthentication() {
    if (!this.authManager) {
      return { status: 'offline' };
    }

    this.authManager.setClient(this.persistenceManager.client);
    const result = await this.authManager.ensureAuthenticated();

    if (result?.status === 'offline') {
      this.persistenceManager.setClient(null);
      this.reportingService?.setClient(null);
      this.userInteractionLogger.setClient(null);
      this.authManager.setClient(null);
      this.isAuthenticated = false;
      this.setReportingNotice(t(texts.auth.offline), 'warning');
    } else if (result?.status === 'authenticated') {
      this.reportingService?.setClient(this.persistenceManager.client);
      this.userInteractionLogger.setClient(this.persistenceManager.client);
      this.userInteractionLogger.resetCachedEmail?.();
      this.isAuthenticated = true;
    }

    return result;
  }

  async handleAuthStateChange(session, context = {}) {
    if (session) {
      this.isAuthenticated = true;
      this.userInteractionLogger.resetCachedEmail?.();
      this.userInteractionLogger.setClient(this.persistenceManager.client);
      this.reportingService?.setClient(this.persistenceManager.client);

      if (this.isInitialized) {
        await this.loadSavedData();
        await this.render();
        await this.subscribeToRealtimeUpdates();
        this.startAutoRefresh();
      }
      return;
    }

    this.isAuthenticated = false;
    this.userInteractionLogger.resetCachedEmail?.();

    if (this.realtimeChannel) {
      try {
        await this.realtimeChannel.unsubscribe();
      } catch (error) {
        console.warn('Nepavyko atsisakyti realaus laiko kanalo po atsijungimo:', error);
      }
      this.realtimeChannel = null;
    }

    if (this.taskRealtimeChannel) {
      try {
        await this.taskRealtimeChannel.unsubscribe();
      } catch (error) {
        console.warn('Nepavyko atsisakyti užduočių realaus laiko kanalo po atsijungimo:', error);
      }
      this.taskRealtimeChannel = null;
    }

    this.stopAutoRefresh();

    if (this.isInitialized) {
      const message = context?.reason === 'offline'
        ? t(texts.auth.offline)
        : t(texts.auth.loginRequired);
      this.setReportingNotice(message, 'warning');
    }
  }

  async handleRealtimeStatusEvent(record, eventType = 'INSERT') {
    try {
      const bedLabel = await this.persistenceManager.getBedLabelById(record.bed_id);
      if (!bedLabel) {
        console.warn('Gautas realaus laiko įvykis su nežinoma lova:', record);
        return;
      }

      const isNew = this.bedDataManager.addFormResponse({
        id: record.id,
        timestamp: record.created_at,
        email: record.reported_by ?? null,
        bedId: bedLabel,
        status: record.status,
        description: record.notes ?? record.metadata?.description ?? null,
        priority: record.priority,
        metadata: record.metadata ?? {},
      }, { allowUpdate: eventType === 'UPDATE' });

      if (!isNew && eventType !== 'UPDATE') {
        return;
      }

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
      await this.render();

      void this.userInteractionLogger.logInteraction('realtime_status_event_received', {
        bedLabel,
        payload: { status: record.status },
      });
    } catch (error) {
      console.error('Klaida apdorojant realaus laiko būsenos įvykį:', error);
    }
  }

  async handleRealtimeOccupancyEvent(record, eventType = 'INSERT') {
    try {
      const mapped = this.persistenceManager.mapBoardRecordToOccupancy(record);
      if (!mapped?.bedId) {
        console.warn('Gautas realaus laiko užimtumo įvykis su nežinoma lova:', record);
        return;
      }

      const allowUpdate = eventType === 'UPDATE' || eventType === 'UPSERT';
      const isNew = this.bedDataManager.addOccupancyData(mapped, { allowUpdate });

      if (!isNew && !allowUpdate) {
        return;
      }

      this.refreshRecurringTasks();

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
      await this.render();

      void this.userInteractionLogger.logInteraction('realtime_occupancy_event_received', {
        bedLabel: mapped.bedId,
        payload: { status: mapped.status },
      });
    } catch (error) {
      console.error('Klaida apdorojant realaus laiko užimtumo įvykį:', error);
    }
  }

  async handleRealtimeTask(record, eventType = 'INSERT') {
    try {
      if (!record) {
        return;
      }

      const taskId = record.id ?? record.task_id ?? record.taskId ?? null;

      if ((eventType ?? '').toUpperCase() === 'DELETE') {
        if (taskId) {
          this.taskManager.removeTask(taskId);
          this.refreshRecurringTasks();
          this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
            fontSizeLevel: this.fontSizeLevel,
          });
          await this.render();
        }
        return;
      }

      const zoneValue = record.zone ?? record.channel ?? 'laboratory';
      const zoneLabel = record.zone_label ?? record.zone ?? record.channel_label ?? record.channel ?? 'laboratorija';

      const taskPayload = {
        id: taskId ?? undefined,
        title: record.title ?? record.name ?? record.summary ?? undefined,
        type: record.type ?? record.category ?? 'logistics',
        typeLabel: record.type_label ?? record.type ?? record.title ?? 'Logistika',
        description: record.description ?? record.notes ?? '',
        responsible: record.responsible ?? record.assignee ?? record.owner ?? '',
        zone: zoneValue,
        zoneLabel,
        channel: zoneValue,
        channelLabel: zoneLabel,
        priority: record.priority ?? TASK_PRIORITIES.MEDIUM,
        dueAt: record.due_at ?? record.dueAt ?? record.deadline ?? null,
        status: record.status ?? TASK_STATUSES.PLANNED,
        recurrence: record.recurrence ?? 'none',
        recurrenceLabel: record.recurrence_label ?? record.recurrence ?? 'none',
        createdAt: record.created_at ?? record.inserted_at ?? null,
        updatedAt: record.updated_at ?? record.modified_at ?? record.created_at ?? null,
        metadata: record.metadata ?? record.meta ?? {},
        source: 'realtime',
      };

      this.taskManager.upsertTask(taskPayload);
      this.refreshRecurringTasks();

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
      await this.render();

      void this.userInteractionLogger.logInteraction('realtime_task_received', {
        payload: { taskId: taskPayload.id, eventType },
      });
    } catch (error) {
      console.error('Klaida apdorojant realaus laiko užduoties įrašą:', error);
    }
  }

  async handleRealtimeTaskEvent(record, eventType = 'INSERT') {
    try {
      if (!record) {
        return;
      }

      const taskId = record.task_id ?? record.taskId ?? record.id ?? null;
      if (!taskId) {
        return;
      }

      if ((eventType ?? '').toUpperCase() === 'DELETE') {
        return;
      }

      const updates = {};
      if (record.status) {
        updates.status = record.status;
      }
      if (record.priority !== undefined && record.priority !== null) {
        updates.priority = record.priority;
      }
      if (record.due_at ?? record.dueAt ?? record.deadline) {
        updates.dueAt = record.due_at ?? record.dueAt ?? record.deadline;
      }
      if (record.responsible ?? record.assignee) {
        updates.responsible = record.responsible ?? record.assignee;
      }
      const zoneUpdateValue = record.zone ?? record.channel ?? undefined;
      const zoneUpdateLabel = record.zone_label ?? record.channel_label ?? record.zone ?? record.channel ?? undefined;
      if (zoneUpdateValue ?? zoneUpdateLabel) {
        updates.zone = zoneUpdateValue;
        updates.zoneLabel = zoneUpdateLabel;
        updates.channel = zoneUpdateValue;
        updates.channelLabel = zoneUpdateLabel;
      }
      if (record.description ?? record.notes) {
        updates.description = record.description ?? record.notes;
      }
      if (record.metadata) {
        updates.metadata = record.metadata;
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      if (this.taskManager.hasTask(taskId)) {
        this.taskManager.updateTask(taskId, updates);
      } else if (record.task && typeof record.task === 'object') {
        this.taskManager.upsertTask({ id: taskId, ...record.task, ...updates });
      }

      this.refreshRecurringTasks();

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
      await this.render();

      void this.userInteractionLogger.logInteraction('realtime_task_event_received', {
        payload: { taskId, eventType },
      });
    } catch (error) {
      console.error('Klaida apdorojant realaus laiko užduoties įvykį:', error);
    }
  }

  /**
   * Read nuotolinės paslaugos konfigūraciją iš data atributų.
   * @returns {{url: string, anonKey: string}}
   */
  readSupabaseConfig() {
    const hostElement = document.body || document.documentElement;
    const dataset = hostElement?.dataset ?? {};
    const url = (dataset.supabaseUrl || '').trim();
    const anonKey = (dataset.supabaseKey || '').trim();

    if (!url || !anonKey) {
      console.info('Nuotolinės paslaugos konfigūracija nerasta – aplikacija veikia vietiniu režimu.');
    } else if (typeof window !== 'undefined') {
      window.__SUPABASE_CONFIG__ = { url, anonKey };
    }

    return { url, anonKey };
  }

  /**
   * Load saved data from persistence
   */
  async loadSavedData() {
    try {
      // Check if data needs migration
      if (this.persistenceManager.needsMigration()) {
        await this.persistenceManager.migrateData();
      }

      if (typeof this.persistenceManager.loadAggregatedBedState === 'function') {
        try {
          const aggregatedState = await this.persistenceManager.loadAggregatedBedState();
          if (aggregatedState) {
            this.bedDataManager.applyAggregatedState(aggregatedState);
          }
        } catch (aggregatedError) {
          console.warn('Nepavyko gauti suvestinės iš nuotolinės paslaugos, tęsiama su įvykių istorija.', aggregatedError);
        }
      }

      // Load form responses
      const formResponses = await this.persistenceManager.loadFormResponses();
      formResponses.forEach(response => {
        this.bedDataManager.addFormResponse(response);
      });

      // Load occupancy data
      const occupancyData = await this.persistenceManager.loadOccupancyData();
      occupancyData.forEach(data => {
        this.bedDataManager.addOccupancyData(data);
      });

      if (!occupancyData.length) {
        await this.applyCsvOccupancyFallback();
        this.usingCsvOccupancy = true;
      } else {
        this.usingCsvOccupancy = false;
      }

      this.syncFormsWithLayout();

      console.log(`Loaded ${formResponses.length} form responses and ${occupancyData.length} occupancy records`);
    } catch (error) {
      console.error('Failed to load saved data:', error);
    }
  }

  refreshRecurringTasks(options = {}) {
    const templates = [
      ...DEFAULT_RECURRING_TEMPLATES,
      ...this.taskManager.getRecurringTemplates(),
    ];

    return materializeRecurringTasks({
      taskManager: this.taskManager,
      templates,
      ...options,
    });
  }

  async applyCsvOccupancyFallback() {
    if (this.isSyncingCsvOccupancy) {
      return 0;
    }

    this.isSyncingCsvOccupancy = true;
    try {
      const rows = await loadCsvData();
      if (!Array.isArray(rows) || !rows.length) {
        return 0;
      }

      const events = rowsToOccupancyEvents(rows);
      let applied = 0;
      for (const event of events) {
        const result = this.bedDataManager.addOccupancyData(event, { allowUpdate: true });
        if (result) {
          applied += 1;
        }
      }

      if (applied > 0) {
        console.info(`CSV užimtumo sinchronizacija: atnaujintos ${applied} lovos.`);
      }

      return events.length;
    } catch (error) {
      console.error('Nepavyko įkelti užimtumo iš CSV', error);
      return 0;
    } finally {
      this.isSyncingCsvOccupancy = false;
    }
  }

  async initNfcFlow() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!this.nfcHandler) {
      this.nfcHandler = new NfcHandler({
        bedStatusForm: this.bedStatusForm,
        client: this.persistenceManager.client,
        logger: this.userInteractionLogger,
      });
    } else {
      this.nfcHandler.client = this.persistenceManager.client;
    }

    try {
      await this.nfcHandler.processCurrentTag();
    } catch (error) {
      console.error('NFC inicializavimo klaida:', error);
    }
  }

  /**
   * Setup UI event listeners
   */
  setupEventListeners() {
    console.log('Setting up event listeners...');

    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
      console.log('Found add task button');
      addTaskBtn.addEventListener('click', () => {
        void this.userInteractionLogger.logInteraction('task_form_open_button', { trigger: 'toolbar' });
        this.taskForm.show({ trigger: 'toolbar' });
      });
    } else {
      console.log('Add task button not found');
    }

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      console.log('Found settings button');
      settingsBtn.addEventListener('click', () => this.settingsUI.show());
    } else {
      console.log('Settings button not found');
    }

    // Add status form button
    const addStatusBtn = document.getElementById('addStatusBtn');
    if (addStatusBtn) {
      console.log('Found add status button');
      addStatusBtn.addEventListener('click', () => {
        void this.userInteractionLogger.logInteraction('status_form_open_button', { trigger: 'toolbar' });
        this.bedStatusForm.show(null, { trigger: 'toolbar' });
      });
    } else {
      console.log('Add status button not found');
    }

    // Add occupancy form button
    const addOccupancyBtn = document.getElementById('addOccupancyBtn');
    if (addOccupancyBtn) {
      console.log('Found add occupancy button');
      addOccupancyBtn.addEventListener('click', () => {
        void this.userInteractionLogger.logInteraction('occupancy_form_open_button', { trigger: 'toolbar' });
        this.occupancyForm.show();
      });
    } else {
      console.log('Add occupancy button not found');
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      console.log('Found refresh button');
      refreshBtn.addEventListener('click', () => { void this.refresh(); });
    } else {
      console.log('Refresh button not found');
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      console.log('Found export button');
      exportBtn.addEventListener('click', () => this.exportData());
    } else {
      console.log('Export button not found');
    }

    // Import button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
      console.log('Found import button');
      importBtn.addEventListener('click', () => this.importData());
    } else {
      console.log('Import button not found');
    }

    // Clear data button
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
      console.log('Found clear data button');
      clearDataBtn.addEventListener('click', () => this.clearAllData());
    } else {
      console.log('Clear data button not found');
    }

    const bedListBtn = document.getElementById('bedListBtn');
    if (bedListBtn) {
      bedListBtn.addEventListener('click', () => {
        this.toggleBedListVisibility();
        void this.userInteractionLogger.logInteraction('bed_list_toggle', { visible: this.isBedListVisible });
      });
      bedListBtn.setAttribute('aria-expanded', this.isBedListVisible ? 'true' : 'false');
    }

    const auditLogBtn = document.getElementById('auditLogBtn');
    if (auditLogBtn) {
      auditLogBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.openAuditLogPage();
      });
      auditLogBtn.setAttribute('aria-haspopup', 'false');
      auditLogBtn.setAttribute('title', t(texts.ui.showAuditLog));
      auditLogBtn.setAttribute('aria-label', t(texts.ui.showAuditLog));
    } else {
      console.log('Audit log button not found');
    }

    const fontSizeUpBtn = document.getElementById('fontSizeBtn');
    if (fontSizeUpBtn) {
      fontSizeUpBtn.addEventListener('click', () => {
        this.changeFontSize(1);
        void this.userInteractionLogger.logInteraction('font_size_increase', { level: this.fontSizeLevel });
      });
    }

    const fontSizeDownBtn = document.getElementById('fontSizeDownBtn');
    if (fontSizeDownBtn) {
      fontSizeDownBtn.addEventListener('click', () => {
        this.changeFontSize(-1);
        void this.userInteractionLogger.logInteraction('font_size_decrease', { level: this.fontSizeLevel });
      });
    }

    const viewToggleBtn = document.getElementById('viewToggle');
    if (viewToggleBtn) {
      viewToggleBtn.addEventListener('click', () => {
        this.toggleViewMode();
        void this.userInteractionLogger.logInteraction('view_mode_toggle', { mode: this.isGridView ? 'grid' : 'list' });
      });
    }

    const bedSearchInput = document.getElementById('bedSearch');
    if (bedSearchInput) {
      bedSearchInput.addEventListener('input', (event) => {
        this.handleBedSearch(event.target.value ?? '');
      });
    }

    const taskSearchLabel = document.querySelector('label[for="taskSearch"]');
    const searchLabelText = t(texts.tasks.searchLabel);
    if (taskSearchLabel) {
      taskSearchLabel.textContent = searchLabelText;
    }

    const taskSearchInput = document.getElementById('taskSearch');
    if (taskSearchInput) {
      taskSearchInput.placeholder = t(texts.tasks.searchPlaceholder);
      if (searchLabelText) {
        taskSearchInput.setAttribute('aria-label', searchLabelText);
      }
      taskSearchInput.addEventListener('input', (event) => {
        this.handleTaskSearch(event.target.value ?? '');
      });
    }

    const taskStatusLabel = document.querySelector('label[for="taskStatusFilter"]');
    if (taskStatusLabel) {
      taskStatusLabel.textContent = t(texts.tasks.statusFilterLabel);
    }

    const taskZoneLabel = document.querySelector('label[for="taskZoneFilter"]');
    if (taskZoneLabel) {
      taskZoneLabel.textContent = t(texts.tasks.zoneFilterLabel);
    }

    const taskStatusFilter = document.getElementById('taskStatusFilter');
    if (taskStatusFilter) {
      this.populateTaskStatusFilter(taskStatusFilter);
      taskStatusFilter.value = this.taskFilters.status;
      taskStatusFilter.addEventListener('change', (event) => {
        this.handleTaskFilterChange('status', event.target.value ?? 'all');
      });
    }

    const taskZoneFilter = document.getElementById('taskZoneFilter');
    if (taskZoneFilter) {
      this.populateTaskZoneFilter(taskZoneFilter);
      taskZoneFilter.value = this.taskFilters.zone;
      taskZoneFilter.addEventListener('change', (event) => {
        this.handleTaskFilterChange('zone', event.target.value ?? 'all');
      });
    }

    const taskListContainer = document.getElementById('taskList');
    if (taskListContainer) {
      taskListContainer.addEventListener('click', (event) => {
        const rawTarget = event.target;
        const elementTarget =
          rawTarget && typeof rawTarget === 'object'
            ? (typeof rawTarget.closest === 'function'
                ? rawTarget
                : rawTarget.parentElement ?? null)
            : null;
        const actionButton = typeof elementTarget?.closest === 'function'
          ? elementTarget.closest('button[data-action="complete-task"]')
          : null;
        if (!actionButton) {
          return;
        }

        const taskElement = actionButton.closest('[data-task-id]');
        const requestedTaskId = actionButton.dataset.taskId || taskElement?.dataset.taskId || '';
        const seriesId = actionButton.dataset.seriesId || taskElement?.dataset.seriesId || '';

        const targetTask = this.resolveTaskCompletionCandidate(requestedTaskId, seriesId);
        if (!targetTask) {
          const identifier = requestedTaskId || seriesId || '(nežinoma)';
          console.warn('Nepavyko rasti užduoties pažymėti kaip užbaigtos:', identifier);
          return;
        }

        const metadata = { ...(targetTask.metadata ?? {}), completedAt: new Date().toISOString() };
        const updatedTask = this.taskManager.updateTask(targetTask.id, {
          status: TASK_STATUSES.COMPLETED,
          metadata,
        });

        if (!updatedTask) {
          console.warn('Nepavyko atnaujinti užduoties:', targetTask.id);
          return;
        }

        void this.userInteractionLogger.logInteraction('task_mark_completed', {
          taskId: targetTask.id,
          seriesId: targetTask.seriesId || seriesId || null,
        });

        this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
          fontSizeLevel: this.fontSizeLevel,
        });

        this.renderTaskList();
        this.renderNotificationSummary();
      });
    }

    document.addEventListener('keydown', this.boundTaskShortcutHandler);

    document.querySelectorAll('[data-report-export]').forEach((button) => {
      const format = button.dataset.reportExport || 'json';
      button.addEventListener('click', () => {
        void this.handleReportExport(format);
      });
    });

    // Bed click handlers for quick status updates
    this.setupBedClickHandlers();
  }

  openAuditLogPage() {
    if (typeof window === 'undefined') {
      console.info('Veiksmų žurnalo puslapis pasiekiamas tik naršyklėje.');
      return;
    }

    try {
      const targetUrl = new URL('./audit.html', window.location.href);
      void this.userInteractionLogger.logInteraction('audit_log_page_open', {
        target: targetUrl.pathname,
      });
      window.location.href = targetUrl.toString();
    } catch (error) {
      console.error('Failed to open audit log page:', error);
      this.showError('Nepavyko atidaryti veiksmų žurnalo puslapio.');
    }
  }

  readViewMode() {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_MODE_STORAGE_KEY) : null;
      if (stored === 'grid' || stored === 'list') {
        return stored;
      }
    } catch (error) {
      console.warn('Nepavyko nuskaityti lovų rodinio nustatymo:', error);
    }
    return 'list';
  }

  saveViewMode(mode) {
    try {
      localStorage?.setItem?.(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Nepavyko išsaugoti lovų rodinio nustatymo:', error);
    }
  }

  readBedListVisibility() {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(BED_LIST_VISIBILITY_KEY) : null;
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch (error) {
      console.warn('Nepavyko nuskaityti lovų sąrašo matomumo:', error);
    }
    return false;
  }

  saveBedListVisibility(value) {
    try {
      localStorage?.setItem?.(BED_LIST_VISIBILITY_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.warn('Nepavyko išsaugoti lovų sąrašo matomumo:', error);
    }
  }

  toggleBedListVisibility() {
    this.isBedListVisible = !this.isBedListVisible;
    this.saveBedListVisibility(this.isBedListVisible);
    this.applyBedListVisibility();
  }

  applyBedListVisibility() {
    const section = document.getElementById('bedListSection');
    const button = document.getElementById('bedListBtn');
    if (section) {
      section.style.display = this.isBedListVisible ? 'block' : 'none';
    }
    if (button) {
      button.textContent = this.isBedListVisible ? t(texts.ui.hideBedList) : t(texts.ui.showBedList);
      button.setAttribute('aria-expanded', this.isBedListVisible ? 'true' : 'false');
    }
  }

  toggleViewMode() {
    this.isGridView = !this.isGridView;
    const mode = this.isGridView ? 'grid' : 'list';
    this.saveViewMode(mode);
    this.updateViewToggleButton();
    this.renderBedGrid();
  }

  updateViewToggleButton() {
    const viewToggleBtn = document.getElementById('viewToggle');
    if (!viewToggleBtn) {
      return;
    }
    const listIcon = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
      </svg>
    `;
    const gridIcon = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>
    `;
    const label = this.isGridView ? t(texts.ui.listView) : t(texts.ui.gridView);
    viewToggleBtn.innerHTML = this.isGridView ? listIcon : gridIcon;
    viewToggleBtn.setAttribute('title', label);
    viewToggleBtn.setAttribute('aria-label', label);
  }

  handleBedSearch(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    this.currentSearchTerm = normalized;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.renderBedGrid();
    }, SEARCH_DEBOUNCE_MS);
  }

  handleTaskSearch(value) {
    const nextValue = typeof value === 'string' ? value.trim() : '';
    if (this.taskSearchDebounceTimer) {
      clearTimeout(this.taskSearchDebounceTimer);
    }

    this.taskSearchDebounceTimer = setTimeout(() => {
      this.taskFilters.search = nextValue;
      this.renderTaskList();
    }, TASK_SEARCH_DEBOUNCE_MS);
  }

  populateTaskStatusFilter(selectElement) {
    if (!selectElement) {
      return;
    }

    const options = [
      { value: 'all', label: t(texts.tasks.statusAll) },
      { value: TASK_STATUSES.PLANNED, label: t(texts.tasks.status?.planned) },
      { value: TASK_STATUSES.IN_PROGRESS, label: t(texts.tasks.status?.inProgress) },
      { value: TASK_STATUSES.COMPLETED, label: t(texts.tasks.status?.completed) },
      { value: TASK_STATUSES.BLOCKED, label: t(texts.tasks.status?.blocked) },
    ];

    selectElement.innerHTML = options
      .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
      .join('');
  }

  populateTaskZoneFilter(selectElement) {
    if (!selectElement) {
      return;
    }

    const options = [
      { value: 'all', label: t(texts.tasks.zoneAll) },
      ...TASK_ZONE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(texts.tasks.zones?.[option.labelKey]) || option.value,
      })),
    ];

    selectElement.innerHTML = options
      .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
      .join('');
  }

  handleTaskFilterChange(key, value) {
    if (!['status', 'zone'].includes(key)) {
      return;
    }
    this.taskFilters[key] = value;
    this.renderTaskList();
  }

  handleTaskShortcut(event) {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    if (!isModifierPressed || !event.shiftKey) {
      return;
    }

    if ((event.key || '').toLowerCase() === 't') {
      event.preventDefault();
      void this.userInteractionLogger.logInteraction('task_form_opened_shortcut', { trigger: 'shortcut' });
      this.taskForm.show({ trigger: 'shortcut' });
    }
  }

  changeFontSize(delta) {
    const nextLevel = clampFontSizeLevel(this.fontSizeLevel + delta);
    if (nextLevel === this.fontSizeLevel) {
      return;
    }
    this.fontSizeLevel = storeFontSizeLevel(nextLevel);
    applyFontSizeLevelToDocument(this.fontSizeLevel, this.document);
    this.notificationManager.setFontSizeLevel?.(this.fontSizeLevel);
    this.renderNotificationSummary();
    this.renderBedGrid();
  }

  getStatusBadgeClass(status) {
    switch (status) {
      case STATUS_OPTIONS.CLEAN:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
      case STATUS_OPTIONS.MESSY_BED:
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
      case STATUS_OPTIONS.MISSING_EQUIPMENT:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
      case STATUS_OPTIONS.OTHER:
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-100';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-200';
    }
  }

  getOccupancyBadgeClass(status) {
    if (status === 'occupied') {
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
    }
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
  }

  /**
   * Setup bed click handlers for quick status updates
   */
  setupBedClickHandlers() {
    // This will be called after the bed grid is rendered
    setTimeout(() => {
      const bedCells = document.querySelectorAll('.bed-cell');
      bedCells.forEach(cell => {
        cell.addEventListener('click', (e) => {
          const bedId = e.currentTarget.dataset.bedId;
          if (bedId) {
            void this.userInteractionLogger.logInteraction('bed_cell_clicked', { bedLabel: bedId });
            this.bedStatusForm.show(bedId, { trigger: 'grid' });
          }
        });

        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const bedId = e.currentTarget.dataset.bedId;
          if (bedId) {
            void this.userInteractionLogger.logInteraction('bed_cell_context_menu', { bedLabel: bedId });
            this.occupancyForm.show(bedId);
          }
        });
      });
    }, 100);
  }

  /**
   * Handle form response submission
   */
  async handleFormResponse(formResponse) {
    try {
      const saved = await this.persistenceManager.saveFormResponse(formResponse);
      if (!saved) {
        throw new Error('Formos duomenys nebuvo išsaugoti');
      }

      this.bedDataManager.addFormResponse(formResponse);
      await this.render();
      console.log('Form response saved:', formResponse);
      void this.userInteractionLogger.logInteraction('bed_status_saved', {
        bedLabel: formResponse.bedId,
        email: formResponse.email,
        payload: { status: formResponse.status },
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to handle form response:', error);
      void this.userInteractionLogger.logInteraction('bed_status_save_failed', {
        bedLabel: formResponse?.bedId,
        payload: { error: error.message },
      });
      return { success: false, error };
    }
  }

  async handleTaskCreated(taskPayload) {
    try {
      const savedTask = this.taskManager.addTask(taskPayload);

      let logTarget = savedTask;
      if (taskPayload.recurrence && taskPayload.recurrence !== 'none') {
        const template = this.taskManager.registerRecurringTemplate(savedTask, {
          frequencyMinutes: taskPayload.metadata?.recurringFrequencyMinutes,
          startAt: savedTask.deadline ?? savedTask.dueAt ?? new Date().toISOString(),
        });

        if (template) {
          this.taskManager.removeTask(savedTask.id);
          logTarget = { ...savedTask, id: template.seriesId, seriesId: template.seriesId };
        }
      }

      this.refreshRecurringTasks({ referenceDate: new Date() });
      this.renderTaskList();
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
      const zoneForLog = logTarget.zone ?? logTarget.channel;
      void this.userInteractionLogger.logInteraction('task_created', {
        taskId: logTarget.id,
        zone: zoneForLog,
        channel: zoneForLog,
        status: logTarget.status,
      });
      return savedTask;
    } catch (error) {
      console.error('Nepavyko sukurti užduoties:', error);
      this.showError(t(texts.messages.taskSaveError));
      return false;
    }
  }

  /**
   * Handle occupancy data submission
   */
  async handleOccupancyData(occupancyData) {
    try {
      const saved = await this.persistenceManager.saveOccupancyData(occupancyData);
      if (!saved) {
        throw new Error('Užimtumo įrašas nebuvo išsaugotas');
      }

      this.bedDataManager.addOccupancyData(occupancyData);
      await this.render();

      console.log('Occupancy data saved:', occupancyData);
      void this.userInteractionLogger.logInteraction('occupancy_saved', {
        bedLabel: occupancyData.bedId,
        email: occupancyData.email,
        payload: { status: occupancyData.status },
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to handle occupancy data:', error);
      void this.userInteractionLogger.logInteraction('occupancy_save_failed', {
        bedLabel: occupancyData?.bedId,
        payload: { error: error.message },
      });
      this.showError('Nepavyko išsaugoti užimtumo duomenų');
      return { success: false, error };
    }
  }

  /**
   * Handle settings changes
   */
  async handleSettingsChange(settings) {
    try {
      // Update bed data manager settings
      this.bedDataManager.updateSettings(settings);
      this.reportingService.setSettings(settings);

      // Update auto-refresh interval
      this.startAutoRefresh();

      // Refresh display
      await this.render();

      console.log('Settings updated:', settings);
    } catch (error) {
      console.error('Failed to handle settings change:', error);
    }
  }

  /**
   * Render the main UI
   */
  async render() {
    this.syncFormsWithLayout();
    try {
      await this.renderKPIs();
      this.applyBedListVisibility();
      this.updateViewToggleButton();
      this.renderBedGrid();
      this.renderNotificationSummary();
      this.renderTaskList();
      await this.updateLastSyncDisplay();
    } catch (error) {
      console.error('Failed to render UI:', error);
      this.showError('Nepavyko atnaujinti sąsajos');
    }
  }

  /**
   * Render KPI cards
   */
  async renderKPIs() {
    const kpiContainer = document.getElementById('kpis');
    if (!kpiContainer) return;

    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator?.classList.remove('hidden');

    try {
      const snapshot = await this.reportingService.fetchKpiSnapshot();

      const formatValue = (value) => {
        if (value === null || value === undefined) return '0';
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toLocaleString('lt-LT') : '0';
      };
      const toFiniteNumber = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
      };

      let totals = { ...(snapshot?.totals ?? {}) };
      let usedLocalOverlay = false;

      if (typeof this.bedDataManager?.getStatistics === 'function') {
        const localStats = this.bedDataManager.getStatistics();
        const shouldOverlay = this.usingCsvOccupancy
          || (toFiniteNumber(totals.totalBeds) === 0 && toFiniteNumber(localStats?.totalBeds) > 0)
          || (toFiniteNumber(totals.occupiedBeds) === 0 && toFiniteNumber(localStats?.occupiedBeds) > 0);

        if (shouldOverlay && localStats) {
          totals = {
            ...totals,
            totalBeds: localStats.totalBeds ?? totals.totalBeds ?? 0,
            occupiedBeds: localStats.occupiedBeds ?? totals.occupiedBeds ?? 0,
            freeBeds: localStats.freeBeds ?? totals.freeBeds ?? 0,
            bedsNeedingCheck: localStats.bedsNeedingCheck ?? totals.bedsNeedingCheck ?? 0,
            recentlyFreedBeds: localStats.recentlyFreedBeds ?? totals.recentlyFreedBeds ?? 0,
          };
          usedLocalOverlay = true;
        }
      }

      const totalsForAttention = (totals.messyBeds ?? 0) + (totals.missingEquipment ?? 0) + (totals.otherProblems ?? 0);
      const recentlyFreedForCleaning = totals.recentlyFreedBeds ?? totals.attentionBeds ?? totalsForAttention;
      const totalBeds = toFiniteNumber(totals.totalBeds);
      const occupiedBeds = toFiniteNumber(totals.occupiedBeds);

      const resolveProgress = (value, total, direction = 'positive') => {
        const KPI_COLORS = {
          good: '#22c55e',
          caution: '#facc15',
          bad: '#ef4444',
          neutral: '#94a3b8',
        };

        const numericValue = toFiniteNumber(value);
        const numericTotal = toFiniteNumber(total);

        if (numericTotal <= 0) {
          return { percent: 0, color: KPI_COLORS.neutral };
        }

        const ratio = Math.min(Math.max(numericValue / numericTotal, 0), 1);
        const thresholds = { low: 0.33, high: 0.66 };

        let colorKey;
        if (direction === 'positive') {
          if (ratio >= thresholds.high) {
            colorKey = 'good';
          } else if (ratio >= thresholds.low) {
            colorKey = 'caution';
          } else {
            colorKey = 'bad';
          }
        } else {
          if (ratio <= thresholds.low) {
            colorKey = 'good';
          } else if (ratio <= thresholds.high) {
            colorKey = 'caution';
          } else {
            colorKey = 'bad';
          }
        }

        return { percent: Math.round(ratio * 100), color: KPI_COLORS[colorKey] };
      };

      const cards = [
        {
          label: 'Sutvarkytos',
          value: totals.cleanBeds,
          variant: 'clean',
          total: totalBeds,
          direction: 'positive',
        },
        {
          label: 'Reikia sutvarkyti',
          value: recentlyFreedForCleaning,
          variant: 'attention',
          total: totalBeds,
          direction: 'negative',
        },
        {
          label: 'Užimtos',
          value: totals.occupiedBeds,
          variant: 'occupied',
          total: totalBeds,
          direction: 'negative',
        },
        {
          label: 'Reikia tikrinti',
          value: totals.bedsNeedingCheck ?? 0,
          variant: 'check',
          total: occupiedBeds > 0 ? occupiedBeds : totalBeds,
          direction: 'negative',
        },
      ];

      kpiContainer.innerHTML = cards
        .map((card) => {
          const { percent, color } = resolveProgress(card.value, card.total, card.direction);
          const cardValue = formatValue(card.value);
          const progressText = Number.isFinite(percent) ? `${percent}%` : '0%';
          return `
            <article class="kpi-card" data-variant="${card.variant}" style="--kpi-progress:${percent}%; --kpi-accent:${color};" aria-label="${escapeHtml(`${card.label}: ${cardValue} (${progressText})`)}">
              <span class="kpi-card__label">${escapeHtml(card.label)}</span>
              <span class="kpi-card__value">${cardValue}</span>
            </article>
          `;
        })
        .join('');

      if (snapshot?.source === 'supabase' && usedLocalOverlay) {
        this.setReportingNotice('Supabase KPI duomenys nepilni – rodome CSV pagrįstą suvestinę.', 'warning');
      } else if (snapshot?.source === 'supabase') {
        const generatedAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString('lt-LT') : '';
        this.setReportingNotice(generatedAt ? `Atnaujinta ${generatedAt}.` : 'Atnaujinta.', 'success');
      } else if (snapshot?.error) {
        this.setReportingNotice('Nuotoliniai duomenys nepasiekiami – rodome vietinius KPI.', 'warning');
      } else if (snapshot && snapshot?.source !== 'supabase') {
        this.setReportingNotice('Nuotolinė duomenų paslauga nepasiekiama – rodomi vietiniai KPI duomenys.', 'warning');
      }
    } catch (error) {
      console.error('Failed to render KPI korteles:', error);
      kpiContainer.innerHTML = '<p class="text-sm text-red-600">Nepavyko įkelti KPI kortelių.</p>';
      this.setReportingNotice('Nepavyko įkelti KPI duomenų.', 'error');
    } finally {
      loadingIndicator?.classList.add('hidden');
    }
  }

  /**
   * Render bed grid
   */
  renderBedGrid() {
    const gridContainer = document.getElementById('bedGrid');
    if (!gridContainer) return;

    const beds = this.bedDataManager.getAllBeds();
    const bedMap = new Map(beds.map((bed) => [bed.bedId, bed]));
    const baseClasses = ['custom-scrollbar', 'max-h-64', 'overflow-y-auto'];

    const layout = this.bedDataManager.getBedLayout();
    const filteredBedIds = layout.filter((bedId) => {
      if (!this.currentSearchTerm) return true;
      return bedId.toLowerCase().includes(this.currentSearchTerm);
    });

    if (filteredBedIds.length === 0) {
      gridContainer.className = `${baseClasses.join(' ')} flex items-center justify-center`;
      gridContainer.innerHTML = `
        <div class="text-sm text-slate-500 dark:text-slate-300">
          ${escapeHtml(t(texts.ui.noBedsFound))}
        </div>
      `;
      return;
    }

    if (this.isGridView) {
      gridContainer.className = `${baseClasses.join(' ')} grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3`;
      gridContainer.innerHTML = filteredBedIds.map((bedId) => {
        const bed = bedMap.get(bedId);
        if (!bed) return '';
        const statusBadge = this.getStatusBadgeClass(bed.currentStatus);
        const occupancyBadge = this.getOccupancyBadgeClass(bed.occupancyStatus);
        const occupancyText = bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva';
        const notificationCount = bed.notifications.length;
        const notificationBadge = notificationCount > 0
          ? `<span class="text-[11px] font-semibold text-red-600 dark:text-red-300">⚠️ ${notificationCount}</span>`
          : '';

        return `
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 flex flex-col items-center gap-2 hover:border-blue-400 hover:shadow-sm transition cursor-pointer" data-bed-id="${escapeHtml(bedId)}">
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(`${t(texts.ui.bedLabel)} ${bedId}`)}</div>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <span class="px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge}">${escapeHtml(bed.currentStatus)}</span>
              <span class="px-2 py-0.5 rounded-md text-xs font-medium ${occupancyBadge}">${escapeHtml(occupancyText)}</span>
            </div>
            ${notificationBadge}
          </div>
        `;
      }).join('');
    } else {
      gridContainer.className = `${baseClasses.join(' ')} space-y-2`;
      gridContainer.innerHTML = filteredBedIds.map((bedId) => {
        const bed = bedMap.get(bedId);
        if (!bed) return '';
        const statusBadge = this.getStatusBadgeClass(bed.currentStatus);
        const occupancyBadge = this.getOccupancyBadgeClass(bed.occupancyStatus);
        const occupancyText = bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva';
        const lastChecked = bed.lastCheckedTime instanceof Date && !Number.isNaN(bed.lastCheckedTime)
          ? bed.lastCheckedTime.toLocaleString('lt-LT')
          : t(texts.ui.noData);
        const lastCheckedBy = bed.lastCheckedBy ? bed.lastCheckedBy : t(texts.ui.unknownUser);
        const notificationBadge = bed.notifications.length
          ? `<span class="text-[11px] font-semibold text-red-600 dark:text-red-300">⚠️ ${bed.notifications.length}</span>`
          : '';

        return `
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 hover:border-blue-400 transition cursor-pointer" data-bed-id="${escapeHtml(bedId)}">
            <div class="flex flex-col sm:flex-row sm:items-center sm:gap-3">
              <span class="rounded-md px-2 py-0.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold">${escapeHtml(`${t(texts.ui.bedLabel)} ${bedId}`)}</span>
              <div class="mt-1 sm:mt-0 flex flex-wrap items-center gap-2">
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge}">${escapeHtml(bed.currentStatus)}</span>
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${occupancyBadge}">${escapeHtml(occupancyText)}</span>
                ${notificationBadge}
              </div>
            </div>
            <div class="flex flex-col sm:items-end text-[11px] text-slate-500 dark:text-slate-300">
              <span>${escapeHtml(t(texts.ui.lastChecked))}: ${escapeHtml(lastChecked)}</span>
              <span>${escapeHtml(t(texts.ui.checkedBy))}: ${escapeHtml(lastCheckedBy)}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    this.setupBedClickHandlers();
  }

  getTaskStatusBadge(status) {
    const statusMeta = {
      [TASK_STATUSES.PLANNED]: {
        label: t(texts.tasks.status?.planned) || TASK_STATUSES.PLANNED,
        classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
        icon: '🗓️',
      },
      [TASK_STATUSES.IN_PROGRESS]: {
        label: t(texts.tasks.status?.inProgress) || TASK_STATUSES.IN_PROGRESS,
        classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100',
        icon: '⚙️',
      },
      [TASK_STATUSES.COMPLETED]: {
        label: t(texts.tasks.status?.completed) || TASK_STATUSES.COMPLETED,
        classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100',
        icon: '✅',
      },
      [TASK_STATUSES.BLOCKED]: {
        label: t(texts.tasks.status?.blocked) || TASK_STATUSES.BLOCKED,
        classes: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
        icon: '⛔',
      },
    };

    return statusMeta[status] ?? statusMeta[TASK_STATUSES.PLANNED];
  }

  getTaskPriorityBadge(priority) {
    const numeric = Number.isFinite(priority) ? priority : TASK_PRIORITIES.MEDIUM;
    if (numeric <= TASK_PRIORITIES.CRITICAL) {
      return {
        label: t(texts.tasks.badges?.critical) || 'Kritinė',
        classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
        icon: '🚨',
      };
    }
    if (numeric <= TASK_PRIORITIES.HIGH) {
      return {
        label: t(texts.tasks.badges?.high) || 'Didelė svarba',
        classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-100',
        icon: '⚠️',
      };
    }
    if (numeric <= TASK_PRIORITIES.MEDIUM) {
      return {
        label: t(texts.tasks.badges?.medium) || 'Vidutinė',
        classes: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-100',
        icon: '🔆',
      };
    }
    return {
      label: t(texts.tasks.badges?.low) || 'Žema',
      classes: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
      icon: 'ℹ️',
    };
  }

  formatTaskDate(value) {
    if (!value) {
      return t(texts.ui.noData);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return t(texts.ui.noData);
    }

    return parsed.toLocaleString('lt-LT');
  }

  isTaskOverdue(task) {
    const dueAt = task?.dueAt ?? task?.deadline;
    if (!dueAt) {
      return false;
    }

    const deadline = new Date(dueAt);
    if (Number.isNaN(deadline.getTime())) {
      return false;
    }

    if (task.status === TASK_STATUSES.COMPLETED) {
      return false;
    }

    return deadline.getTime() < Date.now();
  }

  renderTaskList() {
    const listContainer = document.getElementById('taskList');
    if (!listContainer) {
      return;
    }

    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
      const addLabel = t(texts.tasks.newButton) || 'Nauja užduotis';
      addTaskBtn.textContent = addLabel;
      addTaskBtn.setAttribute('aria-label', addLabel);
      addTaskBtn.setAttribute('title', addLabel);
    }

    const heading = document.getElementById('taskListHeading');
    if (heading) {
      heading.textContent = t(texts.tasks.title);
    }

    const shortcutHint = document.getElementById('taskShortcutHint');
    if (shortcutHint) {
      shortcutHint.textContent = t(texts.tasks.shortcutHint);
    }

    const taskStatusLabel = document.querySelector('label[for="taskStatusFilter"]');
    if (taskStatusLabel) {
      taskStatusLabel.textContent = t(texts.tasks.statusFilterLabel);
    }

    const taskZoneLabel = document.querySelector('label[for="taskZoneFilter"]');
    if (taskZoneLabel) {
      taskZoneLabel.textContent = t(texts.tasks.zoneFilterLabel);
    }

    const searchInput = document.getElementById('taskSearch');
    if (searchInput) {
      const placeholder = t(texts.tasks.searchPlaceholder);
      if (searchInput.placeholder !== placeholder) {
        searchInput.placeholder = placeholder;
      }
      if (searchInput.value !== this.taskFilters.search) {
        searchInput.value = this.taskFilters.search;
      }
    }

    const statusFilter = document.getElementById('taskStatusFilter');
    if (statusFilter) {
      this.populateTaskStatusFilter(statusFilter);
      statusFilter.value = this.taskFilters.status;
    }

    const zoneFilter = document.getElementById('taskZoneFilter');
    if (zoneFilter) {
      this.populateTaskZoneFilter(zoneFilter);
      zoneFilter.value = this.taskFilters.zone;
    }

    const tasks = this.taskManager.filterTasks(this.taskFilters);
    const allTasks = this.taskManager.getTasks();
    if (!tasks.length) {
      listContainer.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-300">${escapeHtml(t(texts.tasks.empty))}</p>`;
      return;
    }

    listContainer.innerHTML = tasks.map((task) => {
      const statusMeta = this.getTaskStatusBadge(task.status);
      const priorityMeta = this.getTaskPriorityBadge(task.priority);
      const deadlineText = this.formatTaskDate(task.dueAt ?? task.deadline);
      const createdText = this.formatTaskDate(task.createdAt);
      const recurrenceText = task.recurrenceLabel || t(texts.tasks.recurrence?.none);
      const responsible = task.responsible?.trim() || '';
      const zoneLabel = task.zoneLabel || task.channelLabel || t(texts.tasks.labels.zoneFallback);
      const patientMeta = task.metadata?.patient ?? {};
      const recurringSourceIds = Array.isArray(task.metadata?.recurringSourceTaskIds)
        ? task.metadata.recurringSourceTaskIds.filter((value) => typeof value === 'string' && value.trim())
        : [];
      const normalizedSeriesId = typeof task.seriesId === 'string' && task.seriesId.trim()
        ? task.seriesId.trim()
        : (recurringSourceIds.length ? task.id : '');
      const preferredTargetId = recurringSourceIds[0] ?? (normalizedSeriesId ? null : task.id);
      const completionTarget = this.resolveTaskCompletionCandidate(preferredTargetId, normalizedSeriesId, allTasks);
      const completionTargetId = completionTarget?.id
        ?? (typeof preferredTargetId === 'string' && preferredTargetId ? preferredTargetId : task.id);
      const hasCompletionTarget = typeof completionTargetId === 'string' && completionTargetId.trim().length > 0;
      const seriesAttribute = normalizedSeriesId
        ? ` data-series-id="${escapeHtml(normalizedSeriesId)}"`
        : '';
      const patientReference = [
        typeof patientMeta.reference === 'string' ? patientMeta.reference.trim() : '',
        typeof patientMeta.surname === 'string' ? patientMeta.surname.trim() : '',
        typeof patientMeta.chartNumber === 'string' ? patientMeta.chartNumber.trim() : '',
      ]
        .filter(Boolean)
        .reduce((acc, value) => {
          if (acc.includes(value)) {
            return acc;
          }
          return [...acc, value];
        }, [])
        .join(' / ');
      const patientDisplayReference =
        patientReference || t(texts.tasks.labels.patientReferenceUnknown);
      const isOverdue = this.isTaskOverdue(task);
      const deadlineClass = isOverdue
        ? 'text-red-600 dark:text-red-300'
        : 'text-slate-700 dark:text-slate-100';
      const overdueBadge = isOverdue
        ? `<span class="px-2 py-0.5 text-[11px] font-semibold text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-200 rounded-md">${escapeHtml(t(texts.tasks.badges.overdue))}</span>`
        : '';
      const responsibleLine = responsible
        ? `<div>${escapeHtml(t(texts.tasks.labels.responsible))}: <span class="font-medium text-slate-700 dark:text-slate-100">${escapeHtml(responsible)}</span></div>`
        : '';
      const completionControls = task.status === TASK_STATUSES.COMPLETED
        ? `<div class="flex items-center justify-end gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-200" role="status">
            <span aria-hidden="true">✅</span>
            <span>${escapeHtml(t(texts.tasks.completedLabel) || 'Užduotis atlikta')}</span>
          </div>`
        : hasCompletionTarget
          ? `<div class="flex justify-end">
              <button type="button" class="task-complete-btn px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 rounded-md transition-colors" data-action="complete-task" data-task-id="${escapeHtml(completionTargetId)}"${seriesAttribute}>
                ${escapeHtml(t(texts.tasks.completeAction) || 'Pažymėti kaip atliktą')}
              </button>
            </div>`
          : '';

      return `
        <article class="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/40 p-3 space-y-3" data-task-id="${escapeHtml(completionTargetId)}"${seriesAttribute} role="listitem">
          <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2 md:flex-1 md:pr-4">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 uppercase tracking-wide">${escapeHtml(zoneLabel)}</span>
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${statusMeta.classes}">${statusMeta.icon} ${escapeHtml(statusMeta.label)}</span>
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${priorityMeta.classes}" title="${escapeHtml(t(texts.tasks.labels?.priority))}">${priorityMeta.icon} ${escapeHtml(priorityMeta.label)}</span>
                ${overdueBadge}
              </div>
              <div class="text-xs text-slate-600 dark:text-slate-300">
                <span class="font-medium text-slate-800 dark:text-slate-100">${escapeHtml(t(texts.tasks.labels.patientReference))}:</span>
                <span class="font-medium text-slate-700 dark:text-slate-100">${escapeHtml(patientDisplayReference)}</span>
              </div>
              <p class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">${escapeHtml(task.description)}</p>
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-300 space-y-1 md:text-right md:w-52">
              ${responsibleLine}
              <div>${escapeHtml(t(texts.tasks.labels.due))}: <span class="font-medium ${deadlineClass}">${escapeHtml(deadlineText)}</span></div>
              <div>${escapeHtml(t(texts.tasks.labels.recurrence))}: <span class="font-medium text-slate-700 dark:text-slate-100">${escapeHtml(recurrenceText)}</span></div>
              <div>${escapeHtml(t(texts.tasks.labels.zone))}: <span class="font-medium text-slate-700 dark:text-slate-100">${escapeHtml(zoneLabel)}</span></div>
              <div>${escapeHtml(t(texts.tasks.labels.created))}: <span class="font-medium text-slate-700 dark:text-slate-100">${escapeHtml(createdText)}</span></div>
            </div>
          </div>
          ${completionControls}
        </article>
      `;
    }).join('');
  }

  getTaskDueTimestamp(task) {
    if (!task || typeof task !== 'object') {
      return Number.POSITIVE_INFINITY;
    }

    const dueValue = task.dueAt ?? task.deadline ?? null;
    if (typeof dueValue === 'string' && dueValue.trim()) {
      const dueDate = new Date(dueValue);
      if (!Number.isNaN(dueDate.getTime())) {
        return dueDate.getTime();
      }
    }

    const createdValue = typeof task.createdAt === 'string' ? task.createdAt : null;
    if (createdValue) {
      const createdDate = new Date(createdValue);
      if (!Number.isNaN(createdDate.getTime())) {
        return createdDate.getTime();
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  compareTaskDueTimes(a, b) {
    const aTime = this.getTaskDueTimestamp(a);
    const bTime = this.getTaskDueTimestamp(b);
    if (aTime === bTime) {
      return 0;
    }
    return aTime - bTime;
  }

  handleNotificationTaskCompletion(taskId, seriesId) {
    const targetTask = this.resolveTaskCompletionCandidate(taskId, seriesId);
    if (!targetTask) {
      const identifier = taskId || seriesId || '(nežinoma)';
      console.warn('Nepavyko rasti užduoties pranešimo kortelėje:', identifier);
      return false;
    }

    if (targetTask.status === TASK_STATUSES.COMPLETED) {
      return true;
    }

    const metadata = { ...(targetTask.metadata ?? {}), completedAt: new Date().toISOString() };
    const updatedTask = this.taskManager.updateTask(targetTask.id, {
      status: TASK_STATUSES.COMPLETED,
      metadata,
    });

    if (!updatedTask) {
      console.warn('Nepavyko atnaujinti užduoties pranešimo kortelėje:', targetTask.id);
      return false;
    }

    void this.userInteractionLogger.logInteraction('task_mark_completed', {
      taskId: targetTask.id,
      seriesId: targetTask.seriesId || seriesId || null,
      source: 'notification_card',
    });

    this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
      suppressAlerts: true,
      fontSizeLevel: this.fontSizeLevel,
    });

    this.renderTaskList();
    this.renderNotificationSummary();
    return true;
  }

  resolveTaskCompletionCandidate(preferredId, seriesId, tasksSource) {
    const tasks = Array.isArray(tasksSource) ? tasksSource : this.taskManager.getTasks();
    const normalisedPreferred = typeof preferredId === 'string' && preferredId.trim() ? preferredId.trim() : null;
    if (normalisedPreferred) {
      const directCandidate = tasks.find((item) => item.id === normalisedPreferred);
      if (directCandidate && directCandidate.status !== TASK_STATUSES.COMPLETED) {
        return directCandidate;
      }
    }

    const normalisedSeries = typeof seriesId === 'string' && seriesId.trim() ? seriesId.trim() : null;
    if (!normalisedSeries) {
      return normalisedPreferred
        ? tasks.find((item) => item.id === normalisedPreferred) ?? null
        : null;
    }

    const seriesTasks = tasks
      .filter((item) => item.seriesId === normalisedSeries)
      .sort((a, b) => this.compareTaskDueTimes(a, b));

    if (!seriesTasks.length) {
      return normalisedPreferred
        ? tasks.find((item) => item.id === normalisedPreferred) ?? null
        : null;
    }

    return seriesTasks.find((item) => item.status !== TASK_STATUSES.COMPLETED) ?? seriesTasks[0];
  }

  setReportingNotice(message, variant = 'info') {
    const noticeElement = document.getElementById('reportingNotice');
    if (!noticeElement) {
      return;
    }

    const variantClasses = {
      info: ['border-blue-200', 'bg-blue-50', 'text-blue-700', 'dark:border-blue-500/40', 'dark:bg-blue-900/40', 'dark:text-blue-100'],
      warning: ['border-amber-200', 'bg-amber-50', 'text-amber-700', 'dark:border-amber-500/40', 'dark:bg-amber-900/40', 'dark:text-amber-100'],
      success: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-700', 'dark:border-emerald-500/40', 'dark:bg-emerald-900/40', 'dark:text-emerald-100'],
      error: ['border-red-200', 'bg-red-50', 'text-red-700', 'dark:border-red-500/40', 'dark:bg-red-900/40', 'dark:text-red-100'],
    };

    Object.values(variantClasses).forEach((classes) => {
      classes.forEach((cls) => noticeElement.classList.remove(cls));
    });

    if (!message) {
      noticeElement.classList.add('hidden');
      noticeElement.textContent = '';
      return;
    }

    noticeElement.textContent = message;
    noticeElement.classList.remove('hidden');
    const selected = variantClasses[variant] ?? variantClasses.info;
    selected.forEach((cls) => noticeElement.classList.add(cls));
  }

  async handleReportExport(format = 'json') {
    try {
      const exportResult = await this.reportingService.exportReport({ format });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (exportResult.format === 'csv') {
        this.downloadReportFile(exportResult.data, `rslsmps-ataskaita-${timestamp}.csv`, 'text/csv');
      } else {
        const jsonString = JSON.stringify(exportResult.data, null, 2);
        this.downloadReportFile(jsonString, `rslsmps-ataskaita-${timestamp}.json`, 'application/json');
      }
      this.setReportingNotice(`Ataskaita (${exportResult.format.toUpperCase()}) atsisiųsta.`, 'success');
    } catch (error) {
      console.error('Failed to export audit report:', error);
      this.showError('Nepavyko eksportuoti ataskaitos. Patikrinkite prisijungimą.');
    }
  }

  downloadReportFile(content, filename, mimeType = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Render notification summary
   */
  renderNotificationSummary() {
    const notificationContainer = document.getElementById('notificationSummary');
    if (!notificationContainer) return;

    this.notificationManager.renderNotificationDisplay(this.bedDataManager.getAllBeds(), {
      fontSizeLevel: this.fontSizeLevel,
      tasks: this.taskManager.getTasks(),
    });
  }

  /**
   * Update last sync display
   */
  async updateLastSyncDisplay() {
    const lastSyncElement = document.getElementById('lastSync');
    if (!lastSyncElement) return;

    const lastSync = await this.persistenceManager.getLastSync();
    if (lastSync) {
      const syncDate = new Date(lastSync);
      lastSyncElement.textContent = `Paskutinis atnaujinimas: ${syncDate.toLocaleString('lt-LT')}`;
    } else {
      lastSyncElement.textContent = 'Duomenys nebuvo sinchronizuoti';
    }
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    // Clear existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    const settings = this.settingsManager.getSettings();
    const intervalMs = settings.autoRefreshInterval * 1000;
    
    this.refreshInterval = setInterval(() => {
      void this.refresh();
    }, intervalMs);
  }

  /**
   * Refresh data and UI
   */
  async refresh() {
    try {
      if (this.usingCsvOccupancy) {
        await this.applyCsvOccupancyFallback();
      }

      this.refreshRecurringTasks();

      await this.render();
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), this.taskManager.getTasks(), {
        fontSizeLevel: this.fontSizeLevel,
      });
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  }

  /**
   * Export data
   */
  async exportData() {
    try {
      await this.persistenceManager.downloadData();
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showError('Nepavyko eksportuoti duomenų');
    }
  }

  /**
   * Import data
   */
  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          await this.persistenceManager.uploadData(file);
          await this.loadSavedData();
          this.refreshRecurringTasks();
          await this.render();
          alert('Duomenys sėkmingai importuoti');
        } catch (error) {
          console.error('Failed to import data:', error);
          this.showError('Nepavyko importuoti duomenų');
        }
      }
    };
    input.click();
  }

  async handleLocalDataClear() {
    await this.clearLocalStorageData();
  }

  async clearLocalStorageData(options = {}) {
    const { silent = false, skipRender = false } = options;

    const localKeys = [
      'bed-management-form-responses',
      'bed-management-occupancy-data',
      'bed-management-last-sync',
      'bed-management-data-version',
      VIEW_MODE_STORAGE_KEY,
      BED_LIST_VISIBILITY_KEY,
      this.taskManager?.storageKey,
    ].filter(Boolean);

    if (typeof localStorage !== 'undefined') {
      localKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn('Nepavyko pašalinti localStorage rakto:', key, error);
        }
      });
    }

    this.bedDataManager = new BedDataManager();
    this.taskManager.clearAllTasks();
    this.taskFilters = { search: '', status: 'all', zone: 'all' };
    this.currentSearchTerm = '';

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.taskSearchDebounceTimer) {
      clearTimeout(this.taskSearchDebounceTimer);
      this.taskSearchDebounceTimer = null;
    }

    this.isBedListVisible = false;
    this.viewMode = 'list';
    this.isGridView = false;

    await this.loadSavedData();

    if (!skipRender) {
      await this.render();
    }

    if (!silent) {
      alert('Vietinė talpykla išvalyta.');
    }
  }

  /**
   * Clear all data
   */
  async clearAllData() {
    if (confirm('Ar tikrai norite ištrinti visus duomenis? Šis veiksmas negrįžtamas.')) {
      try {
        await this.persistenceManager.clearAllData();
        await this.clearLocalStorageData({ silent: true, skipRender: true });
        await this.render();
        alert('Visi duomenys ištrinti');
      } catch (error) {
        console.error('Failed to clear data:', error);
        this.showError('Nepavyko ištrinti duomenų');
      }
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorContainer = document.getElementById('error');
    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.classList.remove('hidden');
      setTimeout(() => {
        errorContainer.classList.add('hidden');
      }, 5000);
    } else {
      alert(message);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    document.removeEventListener('keydown', this.boundTaskShortcutHandler);
    this.isInitialized = false;
  }
}

const STATUS_ICON_PRIORITY = {
  '🧹': 0,
  '🚫': 1,
  '🟩': 2,
  '✅': 3,
  '🛏️': 4,
  '🧰': 5,
  '⛔': 7,
};

const CLEANING_ICON = '🧹';
const SLA_ICON = '⛔';

const normalizeText = (value = '') => value?.toString().toLowerCase();

const resolveRowIdentifier = (row, fallbackIndex) => {
  if (row?.lova && row.lova.trim()) {
    return row.lova.trim();
  }

  const order = typeof row?.order === 'number' ? row.order : fallbackIndex;
  return `row-${order}`;
};

export function applyFilters(rows = [], filters = {}) {
  const statusFilter = normalizeText(filters.status).trim();
  const slaFilter = normalizeText(filters.sla).trim();
  const query = normalizeText(filters.query).trim();

  return rows.filter((row) => {
    const statusText = normalizeText(row?.galutine);
    const slaText = normalizeText(row?.sla);
    const lovaText = normalizeText(row?.lova);
    const whoText = normalizeText(row?.who);

    if (statusFilter && !statusText.includes(statusFilter)) {
      return false;
    }

    if (slaFilter && !slaText.includes(slaFilter)) {
      return false;
    }

    if (query) {
      const matchesQuery = [lovaText, statusText, slaText, whoText]
        .some((field) => field.includes(query));
      if (!matchesQuery) {
        return false;
      }
    }

    return true;
  });
}

export function statusPriority(status) {
  if (!status || typeof status !== 'string') {
    return 99;
  }

  const trimmed = status.trim();
  if (!trimmed) {
    return 99;
  }

  const icon = Array.from(trimmed)[0];
  if (Object.prototype.hasOwnProperty.call(STATUS_ICON_PRIORITY, icon)) {
    return STATUS_ICON_PRIORITY[icon];
  }

  return 9;
}

export function formatDuration(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return '';
  }

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours === 0 && minutes === 0) {
    return '0 min';
  }

  if (minutes === 0) {
    return `${wholeHours} val`;
  }

  if (wholeHours === 0) {
    return `${minutes} min`;
  }

  return `${wholeHours} val ${minutes} min`;
}

export function buildCriticalSet(rows = []) {
  const set = new Set();

  rows.forEach((row, index) => {
    const identifier = resolveRowIdentifier(row, index);
    const statusText = row?.galutine || '';
    const slaText = row?.sla || '';

    if (statusText.includes(CLEANING_ICON)) {
      set.add(`cleaning|${identifier}`);
    }

    if (slaText.includes(SLA_ICON)) {
      set.add(`sla|${identifier}`);
    }
  });

  return set;
}

export function detectNewCritical(previousSet = new Set(), rows = []) {
  const currentSet = buildCriticalSet(rows);
  const newOnes = [];

  currentSet.forEach((key) => {
    if (!previousSet.has(key)) {
      newOnes.push(key);
    }
  });

  return { newOnes, currentSet };
}

// Initialize the app when DOM is loaded (browser environment only)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    const app = new BedManagementApp();
    app.init();

    // Make app globally available for debugging
    window.bedManagementApp = app;
  });
}
