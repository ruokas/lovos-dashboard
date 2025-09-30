/**
 * Settings management system for bed cleanliness management
 */

import { DEFAULT_SETTINGS } from '../models/bedData.js';

const SETTINGS_STORAGE_KEY = 'bed-management-settings';

export class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    this.listeners = [];
  }

  /**
   * Load settings from localStorage or use defaults
   */
  loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Update specific setting
   */
  updateSetting(key, value) {
    if (key in this.settings) {
      this.settings[key] = value;
      this.saveSettings();
    }
  }

  /**
   * Update multiple settings at once
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  /**
   * Add listener for settings changes
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * Remove listener
   */
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of settings changes
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.settings);
      } catch (error) {
        console.error('Error in settings listener:', error);
      }
    });
  }
}

/**
 * Settings UI component
 */
export class SettingsUI {
  constructor(settingsManager, onSettingsChange) {
    this.settingsManager = settingsManager;
    this.onSettingsChange = onSettingsChange;
    this.isOpen = false;
    this.modal = null;
    
    this.settingsManager.addListener((settings) => {
      if (this.onSettingsChange) {
        this.onSettingsChange(settings);
      }
    });
  }

  /**
   * Create and show settings modal
   */
  show() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.createModal();
    document.body.appendChild(this.modal);
    
    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector('input, select');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  /**
   * Hide settings modal
   */
  hide() {
    if (!this.isOpen || !this.modal) return;
    
    this.isOpen = false;
    document.body.removeChild(this.modal);
    this.modal = null;
  }

  /**
   * Create the settings modal HTML
   */
  createModal() {
    const settings = this.settingsManager.getSettings();
    
    this.modal = document.createElement('div');
    this.modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    this.modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Nustatymai</h2>
            <button id="closeSettings" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <form id="settingsForm" class="space-y-6">
            <!-- Check Intervals -->
            <div class="space-y-4">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Patikrinimo intervalai</h3>
              
              <div>
                <label for="checkIntervalOccupied" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Patikrinti užimtas lovas kas (valandos)
                </label>
                <input 
                  type="number" 
                  id="checkIntervalOccupied" 
                  name="checkIntervalOccupied"
                  min="0.5" 
                  max="24" 
                  step="0.5"
                  value="${settings.checkIntervalOccupied}"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>
              
              <div>
                <label for="recentlyFreedThreshold" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  "Ką tik atlaisvinta" laikotarpis (valandos)
                </label>
                <input 
                  type="number" 
                  id="recentlyFreedThreshold" 
                  name="recentlyFreedThreshold"
                  min="0.25" 
                  max="6" 
                  step="0.25"
                  value="${settings.recentlyFreedThreshold}"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>
              
              <div>
                <label for="slaThreshold" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  SLA slenkstis (valandos)
                </label>
                <input 
                  type="number" 
                  id="slaThreshold" 
                  name="slaThreshold"
                  min="1" 
                  max="12" 
                  step="0.5"
                  value="${settings.slaThreshold}"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>
            </div>
            
            <!-- Auto Refresh -->
            <div class="space-y-4">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Automatinis atnaujinimas</h3>
              
              <div>
                <label for="autoRefreshInterval" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Atnaujinti kas (sekundės)
                </label>
                <input 
                  type="number" 
                  id="autoRefreshInterval" 
                  name="autoRefreshInterval"
                  min="10" 
                  max="300" 
                  step="10"
                  value="${settings.autoRefreshInterval}"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>
            </div>
            
            <!-- Notifications -->
            <div class="space-y-4">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Pranešimai</h3>
              
              <div class="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="soundEnabled" 
                  name="soundEnabled"
                  ${settings.soundEnabled ? 'checked' : ''}
                  class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded"
                >
                <label for="soundEnabled" class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Garso signalai
                </label>
              </div>
              
              <div class="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="notificationsEnabled" 
                  name="notificationsEnabled"
                  ${settings.notificationsEnabled ? 'checked' : ''}
                  class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded"
                >
                <label for="notificationsEnabled" class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pranešimai įjungti
                </label>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="flex justify-between pt-6 border-t border-slate-200 dark:border-slate-600">
              <button 
                type="button" 
                id="resetSettings"
                class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
              >
                Atkurti numatytuosius
              </button>
              
              <div class="space-x-3">
                <button 
                  type="button" 
                  id="cancelSettings"
                  class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                >
                  Atšaukti
                </button>
                <button 
                  type="submit"
                  class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  Išsaugoti
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to the modal
   */
  attachEventListeners() {
    // Close button
    this.modal.querySelector('#closeSettings').addEventListener('click', () => {
      this.hide();
    });

    // Cancel button
    this.modal.querySelector('#cancelSettings').addEventListener('click', () => {
      this.hide();
    });

    // Reset button
    this.modal.querySelector('#resetSettings').addEventListener('click', () => {
      if (confirm('Ar tikrai norite atkurti visus nustatymus į numatytuosius?')) {
        this.settingsManager.resetToDefaults();
        this.hide();
      }
    });

    // Form submission
    this.modal.querySelector('#settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Save settings from form
   */
  saveSettings() {
    const formData = new FormData(this.modal.querySelector('#settingsForm'));
    const newSettings = {};
    
    // Handle numeric inputs
    const numericFields = ['checkIntervalOccupied', 'recentlyFreedThreshold', 'slaThreshold', 'autoRefreshInterval'];
    numericFields.forEach(field => {
      const value = formData.get(field);
      if (value !== null) {
        newSettings[field] = parseFloat(value);
      }
    });
    
    // Handle checkboxes
    newSettings.soundEnabled = formData.has('soundEnabled');
    newSettings.notificationsEnabled = formData.has('notificationsEnabled');
    
    this.settingsManager.updateSettings(newSettings);
    this.hide();
  }
}
