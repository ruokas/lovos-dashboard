/**
 * Main application controller for bed cleanliness management system
 */

import { BedDataManager, BED_LAYOUT, STATUS_OPTIONS } from './models/bedData.js';
import { SettingsManager, SettingsUI } from './settings/settingsManager.js';
import { BedStatusForm, OccupancyForm } from './forms/bedStatusForm.js';
import { NotificationManager } from './notifications/notificationManager.js';
import { DataPersistenceManager } from './persistence/dataPersistenceManager.js';
import { UserInteractionLogger } from './analytics/userInteractionLogger.js';
import { NfcHandler } from './nfc/nfcHandler.js';
import { ReportingService } from './reports/reportingService.js';
import { SupabaseAuthManager } from './auth/supabaseAuth.js';
import { t, texts } from './texts.js';

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export class BedManagementApp {
  constructor() {
    this.bedDataManager = new BedDataManager();
    this.settingsManager = new SettingsManager();
    this.persistenceManager = new DataPersistenceManager({ document: typeof document !== 'undefined' ? document : undefined });
    this.notificationManager = new NotificationManager(this.settingsManager);
    const sharedDocument = typeof document !== 'undefined' ? document : undefined;
    this.reportingService = new ReportingService({
      client: this.persistenceManager.client,
      bedDataManager: this.bedDataManager,
      notificationManager: this.notificationManager,
      settings: this.settingsManager.getSettings(),
    });
    this.userInteractionLogger = new UserInteractionLogger({ document: sharedDocument, client: this.persistenceManager.client });

    this.authManager = new SupabaseAuthManager({
      client: this.persistenceManager.client,
      document: sharedDocument,
      onAuthStateChanged: (session, context) => {
        void this.handleAuthStateChange(session, context);
      },
    });

    this.supabaseConfig = { url: '', anonKey: '' };
    this.isAuthenticated = false;

    this.bedStatusForm = new BedStatusForm((formResponse) => this.handleFormResponse(formResponse), {
      logger: this.userInteractionLogger,
    });
    this.occupancyForm = new OccupancyForm((occupancyData) => this.handleOccupancyData(occupancyData));
    this.settingsUI = new SettingsUI(this.settingsManager, (settings) => this.handleSettingsChange(settings));

    this.refreshInterval = null;
    this.isInitialized = false;
    this.nfcHandler = null;
    this.realtimeChannel = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Read Supabase configuration from HTML data attributes
      this.supabaseConfig = this.readSupabaseConfig();
      if (this.reportingService) {
        this.reportingService.setClient(this.persistenceManager.client);
      }

      if (this.authManager) {
        this.authManager.setClient(this.persistenceManager.client);
        const authResult = await this.ensureAuthentication();
        this.isAuthenticated = authResult?.status === 'authenticated';
      }

      // Load saved data
      await this.loadSavedData();

      // Mark current notifications as jau matytos, kad realaus laiko įvykiai neskambėtų du kartus
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds(), { suppressAlerts: true });

      // Initialize NFC ir URL srautus
      await this.initNfcFlow();

      // Setup UI event listeners
      this.setupEventListeners();

      // Initial render
      await this.render();

      // Subscribe to Supabase real-time, jei pasiekiama
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
      console.info('Supabase realaus laiko kanalas neaktyvus.');
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occupancy_events' }, (payload) => {
        if (!payload?.new) return;
        void this.handleRealtimeOccupancyEvent(payload.new, payload.eventType ?? payload.type ?? 'INSERT');
      });

    const status = await channel.subscribe();
    if (status === 'SUBSCRIBED') {
      console.log('Prisijungta prie realaus laiko atnaujinimų.');
    }

    this.realtimeChannel = channel;
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

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds());
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
      const bedLabel = await this.persistenceManager.getBedLabelById(record.bed_id);
      if (!bedLabel) {
        console.warn('Gautas realaus laiko užimtumo įvykis su nežinoma lova:', record);
        return;
      }

      const isNew = this.bedDataManager.addOccupancyData({
        id: record.id,
        timestamp: record.created_at,
        bedId: bedLabel,
        status: record.occupancy_state,
        patientCode: record.patient_code ?? null,
        expectedUntil: record.expected_until ?? null,
        notes: record.notes ?? null,
        createdBy: record.created_by ?? null,
        metadata: record.metadata ?? {},
      }, { allowUpdate: eventType === 'UPDATE' });

      if (!isNew && eventType !== 'UPDATE') {
        return;
      }

      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds());
      await this.render();

      void this.userInteractionLogger.logInteraction('realtime_occupancy_event_received', {
        bedLabel,
        payload: { status: record.occupancy_state },
      });
    } catch (error) {
      console.error('Klaida apdorojant realaus laiko užimtumo įvykį:', error);
    }
  }

  /**
   * Read Supabase configuration from data attributes.
   * @returns {{url: string, anonKey: string}}
   */
  readSupabaseConfig() {
    const hostElement = document.body || document.documentElement;
    const dataset = hostElement?.dataset ?? {};
    const url = (dataset.supabaseUrl || '').trim();
    const anonKey = (dataset.supabaseKey || '').trim();

    if (!url || !anonKey) {
      console.info('Supabase konfigūracija nerasta – aplikacija veikia vietiniu režimu.');
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
          console.warn('Nepavyko gauti suvestinės iš Supabase, tęsiama su įvykių istorija.', aggregatedError);
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
      
      console.log(`Loaded ${formResponses.length} form responses and ${occupancyData.length} occupancy records`);
    } catch (error) {
      console.error('Failed to load saved data:', error);
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
      refreshBtn.addEventListener('click', () => this.refresh());
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

    document.querySelectorAll('[data-report-export]').forEach((button) => {
      const format = button.dataset.reportExport || 'json';
      button.addEventListener('click', () => {
        void this.handleReportExport(format);
      });
    });

    // Bed click handlers for quick status updates
    this.setupBedClickHandlers();
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
    try {
      await this.renderKPIs();
      this.renderBedGrid();
      this.renderNotificationSummary();
      await this.renderAuditTrail();
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
      const [snapshot, dailyMetrics] = await Promise.all([
        this.reportingService.fetchKpiSnapshot(),
        this.reportingService.fetchDailyMetrics({ limit: 1 }),
      ]);

      const totals = snapshot?.totals ?? {};
      const notifications = snapshot?.notifications ?? { total: 0, high: 0, medium: 0, low: 0 };
      const todayMetrics = dailyMetrics?.data?.[0] ?? null;
      const avgMinutes = todayMetrics?.avgMinutesBetweenStatusAndOccupancy;
      const avgText = avgMinutes === null || avgMinutes === undefined
        ? '–'
        : `${Math.round(avgMinutes)} min`;

      kpiContainer.innerHTML = `
        <div class="card kpi-card bg-white dark:bg-slate-800">
          <h3 class="kpi-title">Sutvarkytos lovos</h3>
          <div class="kpi-value bg-emerald-100 text-emerald-800">${totals.cleanBeds ?? 0}</div>
          <p class="kpi-subtitle text-xs text-slate-500 dark:text-slate-400">Iš viso: ${totals.totalBeds ?? 0}</p>
        </div>
        <div class="card kpi-card bg-white dark:bg-slate-800">
          <h3 class="kpi-title">Reikia dėmesio</h3>
          <div class="kpi-value bg-yellow-100 text-yellow-800">${totals.attentionBeds ?? 0}</div>
          <p class="kpi-subtitle text-xs text-slate-500 dark:text-slate-400">Problemos: ${(totals.messyBeds ?? 0) + (totals.missingEquipment ?? 0) + (totals.otherProblems ?? 0)}</p>
          <p class="kpi-subtitle text-xs text-slate-500 dark:text-slate-400">Pranešimai: ${notifications.total ?? 0}</p>
        </div>
        <div class="card kpi-card bg-white dark:bg-slate-800">
          <h3 class="kpi-title">Užimtos lovos</h3>
          <div class="kpi-value bg-rose-100 text-rose-800">${totals.occupiedBeds ?? 0}</div>
          <p class="kpi-subtitle text-xs text-slate-500 dark:text-slate-400">Laisvos: ${totals.freeBeds ?? 0}</p>
        </div>
        <div class="card kpi-card bg-white dark:bg-slate-800">
          <h3 class="kpi-title">SLA pažeidimai (24h)</h3>
          <div class="kpi-value ${todayMetrics?.slaBreaches ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">${todayMetrics?.slaBreaches ?? 0}</div>
          <p class="kpi-subtitle text-xs text-slate-500 dark:text-slate-400">Vid. reakcija: ${avgText}</p>
        </div>
      `;

      if (snapshot?.source === 'supabase' && dailyMetrics?.source === 'supabase') {
        const generatedAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString('lt-LT') : '';
        this.setReportingNotice(generatedAt ? `Supabase KPI atnaujinta ${generatedAt}.` : 'Supabase KPI atnaujinta.', 'success');
      } else if (snapshot?.error || dailyMetrics?.error) {
        this.setReportingNotice('Supabase duomenys nepasiekiami – rodome vietinius KPI.', 'warning');
      } else if (snapshot?.source !== 'supabase' || dailyMetrics?.source !== 'supabase') {
        this.setReportingNotice('Supabase nepasiekiamas – rodomi vietiniai KPI duomenys.', 'warning');
      }
    } catch (error) {
      console.error('Failed to render KPI korteles:', error);
      kpiContainer.innerHTML = '<p class="text-sm text-red-600">Nepavyko įkelti KPI kortelių.</p>';
      this.setReportingNotice('Nepavyko įkelti KPI duomenų.', 'error');
    } finally {
      loadingIndicator?.classList.add('hidden');
    }
  }

  async renderAuditTrail() {
    const container = document.getElementById('auditContent');
    if (!container) return;

    try {
      const audit = await this.reportingService.fetchInteractionAudit({ limit: 10 });
      if (audit.source !== 'supabase') {
        container.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400">Supabase nepasiekiamas – audito žurnalas nerodomas.</p>';
        return;
      }

      if (!audit.data.length) {
        container.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400">Kol kas nėra audito įrašų.</p>';
        return;
      }

      container.innerHTML = audit.data.map((item) => {
        const occurred = item.occurredAt ? new Date(item.occurredAt) : null;
        const occurredText = occurred && !Number.isNaN(occurred.getTime())
          ? occurred.toLocaleString('lt-LT')
          : '–';
        const bedLabel = item.payload?.bedLabel ?? item.payload?.bedId ?? item.bedId ?? '–';
        const performer = item.performedBy ?? 'Nežinomas naudotojas';
        const details = item.payload?.payload?.status ?? item.payload?.status ?? '';

        return `
          <div class="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-700 py-2 last:border-b-0">
            <div class="flex-1 pr-2">
              <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${escapeHtml(item.interactionType)}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Lova: ${escapeHtml(bedLabel)}${details ? ` • ${escapeHtml(details)}` : ''}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Vykdytojas: ${escapeHtml(performer)}</p>
            </div>
            <span class="text-xs text-slate-500 dark:text-slate-400 mt-1 md:mt-0">${escapeHtml(occurredText)}</span>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to render audit trail:', error);
      container.innerHTML = '<p class="text-sm text-red-600">Nepavyko įkelti audito įrašų.</p>';
    }
  }

  /**
   * Render bed grid
   */
  renderBedGrid() {
    const gridContainer = document.getElementById('bedGrid');
    if (!gridContainer) return;
    
    const beds = this.bedDataManager.getAllBeds();
    const bedsWithNotifications = this.bedDataManager.getBedsWithNotifications();
    const notificationBedIds = new Set(bedsWithNotifications.map(bed => bed.bedId));
    
    gridContainer.innerHTML = BED_LAYOUT.map(bedId => {
      const bed = beds.find(b => b.bedId === bedId);
      if (!bed) return '';
      
      const statusClass = bed.getStatusColorClass();
      const occupancyClass = bed.getOccupancyColorClass();
      const hasNotifications = notificationBedIds.has(bedId);
      const notificationClass = hasNotifications ? 'ring-2 ring-red-400' : '';
      
      return `
        <div class="bed-cell ${statusClass} ${occupancyClass} ${notificationClass}" data-bed-id="${bedId}">
          <div class="bed-id">${bedId}</div>
          <div class="bed-info">
            <div class="text-xs">${bed.currentStatus}</div>
            <div class="text-xs">${bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva'}</div>
            ${hasNotifications ? '<div class="text-xs text-red-600 font-bold">!</div>' : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Re-setup click handlers
    this.setupBedClickHandlers();
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
    
    this.notificationManager.renderNotificationDisplay(this.bedDataManager.getAllBeds());
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
      this.refresh();
    }, intervalMs);
  }

  /**
   * Refresh data and UI
   */
  refresh() {
    try {
      void this.render();
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds());
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

  /**
   * Clear all data
   */
  async clearAllData() {
    if (confirm('Ar tikrai norite ištrinti visus duomenis? Šis veiksmas negrįžtamas.')) {
      try {
        await this.persistenceManager.clearAllData();
        this.bedDataManager = new BedDataManager();
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
