/**
 * Data persistence system for bed cleanliness management
 */

export class DataPersistenceManager {
  constructor() {
    this.storageKeys = {
      formResponses: 'bed-management-form-responses',
      occupancyData: 'bed-management-occupancy-data',
      lastSync: 'bed-management-last-sync',
      version: 'bed-management-data-version'
    };
    
    this.currentVersion = '1.0.0';
    this.maxStorageItems = 10000; // Prevent localStorage from getting too large
  }

  /**
   * Save form response to localStorage
   */
  saveFormResponse(formResponse) {
    try {
      const responses = this.loadFormResponses();
      responses.push(formResponse);
      
      // Keep only the most recent responses to prevent storage overflow
      if (responses.length > this.maxStorageItems) {
        responses.splice(0, responses.length - this.maxStorageItems);
      }
      
      localStorage.setItem(this.storageKeys.formResponses, JSON.stringify(responses));
      this.updateLastSync();
      return true;
    } catch (error) {
      console.error('Failed to save form response:', error);
      return false;
    }
  }

  /**
   * Load form responses from localStorage
   */
  loadFormResponses() {
    try {
      const stored = localStorage.getItem(this.storageKeys.formResponses);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Failed to load form responses:', error);
    }
    return [];
  }

  /**
   * Save occupancy data to localStorage
   */
  saveOccupancyData(occupancyData) {
    try {
      const data = this.loadOccupancyData();
      data.push(occupancyData);
      
      // Keep only the most recent data
      if (data.length > this.maxStorageItems) {
        data.splice(0, data.length - this.maxStorageItems);
      }
      
      localStorage.setItem(this.storageKeys.occupancyData, JSON.stringify(data));
      this.updateLastSync();
      return true;
    } catch (error) {
      console.error('Failed to save occupancy data:', error);
      return false;
    }
  }

  /**
   * Load occupancy data from localStorage
   */
  loadOccupancyData() {
    try {
      const stored = localStorage.getItem(this.storageKeys.occupancyData);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Failed to load occupancy data:', error);
    }
    return [];
  }

  /**
   * Export all data for backup
   */
  exportData() {
    try {
      const data = {
        version: this.currentVersion,
        exportTimestamp: new Date().toISOString(),
        formResponses: this.loadFormResponses(),
        occupancyData: this.loadOccupancyData(),
        lastSync: this.getLastSync()
      };
      
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      return null;
    }
  }

  /**
   * Import data from backup
   */
  importData(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      if (!data.version || !data.formResponses || !data.occupancyData) {
        throw new Error('Invalid data format');
      }
      
      // Validate data structure
      if (!Array.isArray(data.formResponses) || !Array.isArray(data.occupancyData)) {
        throw new Error('Invalid data arrays');
      }
      
      // Save imported data
      localStorage.setItem(this.storageKeys.formResponses, JSON.stringify(data.formResponses));
      localStorage.setItem(this.storageKeys.occupancyData, JSON.stringify(data.occupancyData));
      localStorage.setItem(this.storageKeys.version, data.version);
      
      if (data.lastSync) {
        localStorage.setItem(this.storageKeys.lastSync, data.lastSync);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  /**
   * Clear all stored data
   */
  clearAllData() {
    try {
      Object.values(this.storageKeys).forEach(key => {
        localStorage.removeItem(key);
      });
      return true;
    } catch (error) {
      console.error('Failed to clear data:', error);
      return false;
    }
  }

  /**
   * Get storage usage information
   */
  getStorageInfo() {
    try {
      const formResponses = this.loadFormResponses();
      const occupancyData = this.loadOccupancyData();
      
      const formSize = JSON.stringify(formResponses).length;
      const occupancySize = JSON.stringify(occupancyData).length;
      const totalSize = formSize + occupancySize;
      
      return {
        formResponsesCount: formResponses.length,
        occupancyDataCount: occupancyData.length,
        formResponsesSize: formSize,
        occupancyDataSize: occupancySize,
        totalSize: totalSize,
        totalSizeKB: Math.round(totalSize / 1024 * 100) / 100,
        lastSync: this.getLastSync()
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return null;
    }
  }

  /**
   * Update last sync timestamp
   */
  updateLastSync() {
    try {
      localStorage.setItem(this.storageKeys.lastSync, new Date().toISOString());
    } catch (error) {
      console.error('Failed to update last sync:', error);
    }
  }

  /**
   * Get last sync timestamp
   */
  getLastSync() {
    try {
      return localStorage.getItem(this.storageKeys.lastSync);
    } catch (error) {
      console.error('Failed to get last sync:', error);
      return null;
    }
  }

  /**
   * Check if data needs migration
   */
  needsMigration() {
    try {
      const storedVersion = localStorage.getItem(this.storageKeys.version);
      return storedVersion !== this.currentVersion;
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * Migrate data to current version
   */
  migrateData() {
    try {
      const storedVersion = localStorage.getItem(this.storageKeys.version);
      
      if (!storedVersion) {
        // First time setup
        localStorage.setItem(this.storageKeys.version, this.currentVersion);
        return true;
      }
      
      // Add migration logic here for future versions
      // For now, just update the version
      localStorage.setItem(this.storageKeys.version, this.currentVersion);
      return true;
    } catch (error) {
      console.error('Failed to migrate data:', error);
      return false;
    }
  }

  /**
   * Download data as file
   */
  downloadData() {
    const data = this.exportData();
    if (!data) {
      alert('Nepavyko eksportuoti duomenų.');
      return;
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

  /**
   * Upload data from file
   */
  uploadData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const success = this.importData(e.target.result);
          if (success) {
            resolve(true);
          } else {
            reject(new Error('Failed to import data'));
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Get data summary for display
   */
  getDataSummary() {
    const formResponses = this.loadFormResponses();
    const occupancyData = this.loadOccupancyData();
    
    const summary = {
      totalFormResponses: formResponses.length,
      totalOccupancyChanges: occupancyData.length,
      lastFormResponse: formResponses.length > 0 ? formResponses[formResponses.length - 1].timestamp : null,
      lastOccupancyChange: occupancyData.length > 0 ? occupancyData[occupancyData.length - 1].timestamp : null,
      lastSync: this.getLastSync()
    };
    
    return summary;
  }
}
