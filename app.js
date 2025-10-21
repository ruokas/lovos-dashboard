/**
 * Main application controller for bed cleanliness management system
 */

import { BedDataManager, BED_LAYOUT, STATUS_OPTIONS } from './models/bedData.js';
import { SettingsManager, SettingsUI } from './settings/settingsManager.js';
import { BedStatusForm, OccupancyForm } from './forms/bedStatusForm.js';
import { NotificationManager } from './notifications/notificationManager.js';
import { DataPersistenceManager } from './persistence/dataPersistenceManager.js';

export class BedManagementApp {
  constructor() {
    this.bedDataManager = new BedDataManager();
    this.settingsManager = new SettingsManager();
    this.persistenceManager = new DataPersistenceManager();
    this.notificationManager = new NotificationManager(this.settingsManager);

    this.supabaseConfig = { url: '', anonKey: '' };
    
    this.bedStatusForm = new BedStatusForm((formResponse) => this.handleFormResponse(formResponse));
    this.occupancyForm = new OccupancyForm((occupancyData) => this.handleOccupancyData(occupancyData));
    this.settingsUI = new SettingsUI(this.settingsManager, (settings) => this.handleSettingsChange(settings));
    
    this.refreshInterval = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Read Supabase configuration from HTML data attributes
      this.supabaseConfig = this.readSupabaseConfig();

      // Load saved data
      await this.loadSavedData();
      
      // Setup UI event listeners
      this.setupEventListeners();
      
      // Initial render
      this.render();
      
      // Start auto-refresh
      this.startAutoRefresh();
      
      this.isInitialized = true;
      console.log('Bed Management App initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Nepavyko inicializuoti programos');
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
        this.persistenceManager.migrateData();
      }
      
      // Load form responses
      const formResponses = this.persistenceManager.loadFormResponses();
      formResponses.forEach(response => {
        this.bedDataManager.addFormResponse(response);
      });
      
      // Load occupancy data
      const occupancyData = this.persistenceManager.loadOccupancyData();
      occupancyData.forEach(data => {
        this.bedDataManager.addOccupancyData(data);
      });
      
      console.log(`Loaded ${formResponses.length} form responses and ${occupancyData.length} occupancy records`);
    } catch (error) {
      console.error('Failed to load saved data:', error);
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
      addStatusBtn.addEventListener('click', () => this.bedStatusForm.show());
    } else {
      console.log('Add status button not found');
    }

    // Add occupancy form button
    const addOccupancyBtn = document.getElementById('addOccupancyBtn');
    if (addOccupancyBtn) {
      console.log('Found add occupancy button');
      addOccupancyBtn.addEventListener('click', () => this.occupancyForm.show());
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
            this.bedStatusForm.show(bedId);
          }
        });
        
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const bedId = e.currentTarget.dataset.bedId;
          if (bedId) {
            this.occupancyForm.show(bedId);
          }
        });
      });
    }, 100);
  }

  /**
   * Handle form response submission
   */
  handleFormResponse(formResponse) {
    try {
      // Add to data manager
      this.bedDataManager.addFormResponse(formResponse);
      
      // Save to persistence
      this.persistenceManager.saveFormResponse(formResponse);
      
      // Refresh display
      this.render();
      
      console.log('Form response saved:', formResponse);
    } catch (error) {
      console.error('Failed to handle form response:', error);
      this.showError('Nepavyko išsaugoti formos duomenų');
    }
  }

  /**
   * Handle occupancy data submission
   */
  handleOccupancyData(occupancyData) {
    try {
      // Add to data manager
      this.bedDataManager.addOccupancyData(occupancyData);
      
      // Save to persistence
      this.persistenceManager.saveOccupancyData(occupancyData);
      
      // Refresh display
      this.render();
      
      console.log('Occupancy data saved:', occupancyData);
    } catch (error) {
      console.error('Failed to handle occupancy data:', error);
      this.showError('Nepavyko išsaugoti užimtumo duomenų');
    }
  }

  /**
   * Handle settings changes
   */
  handleSettingsChange(settings) {
    try {
      // Update bed data manager settings
      this.bedDataManager.updateSettings(settings);
      
      // Update auto-refresh interval
      this.startAutoRefresh();
      
      // Refresh display
      this.render();
      
      console.log('Settings updated:', settings);
    } catch (error) {
      console.error('Failed to handle settings change:', error);
    }
  }

  /**
   * Render the main UI
   */
  render() {
    try {
      this.renderKPIs();
      this.renderBedGrid();
      this.renderNotificationSummary();
      this.updateLastSyncDisplay();
    } catch (error) {
      console.error('Failed to render UI:', error);
      this.showError('Nepavyko atnaujinti sąsajos');
    }
  }

  /**
   * Render KPI cards
   */
  renderKPIs() {
    const kpiContainer = document.getElementById('kpis');
    if (!kpiContainer) return;
    
    const stats = this.bedDataManager.getStatistics();
    const notificationStats = this.notificationManager.getNotificationStats(this.bedDataManager.getAllBeds());
    
    kpiContainer.innerHTML = `
      <div class="card kpi-card bg-white dark:bg-slate-800">
        <h3 class="kpi-title">Sutvarkytos lovos</h3>
        <div class="kpi-value bg-emerald-100 text-emerald-800">${stats.cleanBeds}</div>
      </div>
      <div class="card kpi-card bg-white dark:bg-slate-800">
        <h3 class="kpi-title">Reikia sutvarkyti</h3>
        <div class="kpi-value bg-yellow-100 text-yellow-800">${stats.messyBeds + stats.missingEquipment + stats.otherProblems}</div>
      </div>
      <div class="card kpi-card bg-white dark:bg-slate-800">
        <h3 class="kpi-title">Užimtos lovos</h3>
        <div class="kpi-value bg-rose-100 text-rose-800">${stats.occupiedBeds}</div>
      </div>
      <div class="card kpi-card bg-white dark:bg-slate-800">
        <h3 class="kpi-title">Pranešimai</h3>
        <div class="kpi-value ${notificationStats.high > 0 ? 'bg-red-100 text-red-800' : notificationStats.medium > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}">${notificationStats.total}</div>
      </div>
    `;
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
  updateLastSyncDisplay() {
    const lastSyncElement = document.getElementById('lastSync');
    if (!lastSyncElement) return;
    
    const lastSync = this.persistenceManager.getLastSync();
    if (lastSync) {
      const syncDate = new Date(lastSync);
      lastSyncElement.textContent = `Paskutinis atnaujinimas: ${syncDate.toLocaleString('lt-LT')}`;
    } else {
      lastSyncElement.textContent = 'Duomenys nebuvo sinchronizuoti';
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
      this.render();
      this.notificationManager.updateNotifications(this.bedDataManager.getAllBeds());
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  }

  /**
   * Export data
   */
  exportData() {
    try {
      this.persistenceManager.downloadData();
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
          this.render();
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
  clearAllData() {
    if (confirm('Ar tikrai norite ištrinti visus duomenis? Šis veiksmas negrįžtamas.')) {
      try {
        this.persistenceManager.clearAllData();
        this.bedDataManager = new BedDataManager();
        this.render();
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
