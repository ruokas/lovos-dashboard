import { parseSupabaseTimestamp } from '../utils/time.js';

/**
 * Data models and calculation engine for bed cleanliness management system
 */

// Bed layout configuration
export const BED_LAYOUT = [
  'IT1', 'IT2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17',
  '121A', '121B'
];

// Form response status options
export const STATUS_OPTIONS = {
  CLEAN: '✅ Viskas tvarkinga',
  MESSY_BED: '🛏️ Netvarkinga lova',
  MISSING_EQUIPMENT: '🧰 Trūksta priemonių',
  OTHER: 'Other'
};

// Priority levels for notifications (lower number = higher priority)
export const PRIORITY_LEVELS = {
  MESSY_BED: 1,
  MISSING_EQUIPMENT: 2,
  OTHER_PROBLEM: 3,
  RECENTLY_FREED: 4,
  REGULAR_CHECK: 5
};

// Default settings
export const DEFAULT_SETTINGS = {
  checkIntervalOccupied: 2, // hours
  recentlyFreedThreshold: 1, // hours
  slaThreshold: 4, // hours
  autoRefreshInterval: 30, // seconds
  soundEnabled: true,
  notificationsEnabled: true
};

/**
 * Bed data model
 */
export class BedData {
  constructor(bedId) {
    this.bedId = bedId;
    this.currentStatus = STATUS_OPTIONS.CLEAN;
    this.occupancyStatus = 'free'; // 'free' or 'occupied'
    this.lastOccupiedTime = null;
    this.lastFreedTime = null;
    this.lastCheckedTime = null;
    this.lastCheckedBy = null;
    this.lastCheckedEmail = null;
    this.problemDescription = null; // for "Other" status
    this.notifications = [];
    this.history = []; // Array of status changes
  }

  /**
   * Update bed status from form response
   */
  updateStatus(formResponse) {
    const timestamp = new Date(formResponse.timestamp);
    const email = formResponse.email;
    const status = formResponse.status;
    const description = formResponse.description || null;

    // Add to history
    this.history.push({
      timestamp,
      email,
      status,
      description,
      previousStatus: this.currentStatus
    });

    // Update current status
    this.currentStatus = status;
    this.lastCheckedTime = timestamp;
    this.lastCheckedBy = email;
    this.lastCheckedEmail = email;
    this.problemDescription = description;

    // Clear old notifications
    this.clearNotifications();
  }

  /**
   * Update occupancy status
   */
  updateOccupancy(occupancyData) {
    if (!occupancyData) return;

    const timestamp = occupancyData.timestamp ? new Date(occupancyData.timestamp) : null;
    const isValidTimestamp = timestamp instanceof Date && !Number.isNaN(timestamp);
    const rawStatus = typeof occupancyData.status === 'string'
      ? occupancyData.status.toLowerCase()
      : '';

    if (!rawStatus) {
      return;
    }

    if (rawStatus === 'occupied') {
      if (isValidTimestamp) {
        this.lastOccupiedTime = timestamp;
      }
      this.occupancyStatus = 'occupied';
      return;
    }

    if (rawStatus === 'free' || rawStatus === 'available') {
      if (isValidTimestamp) {
        this.lastFreedTime = timestamp;
      }
      this.occupancyStatus = 'free';
      return;
    }

    if (rawStatus === 'cleaning') {
      if (isValidTimestamp) {
        this.lastFreedTime = timestamp;
      }
      this.occupancyStatus = 'cleaning';
      return;
    }

    this.occupancyStatus = rawStatus;
  }

  /**
   * Calculate current notifications based on settings
   */
  calculateNotifications(settings = DEFAULT_SETTINGS) {
    this.notifications = [];
    const now = new Date();

    // Priority 1: Messy bed
    if (this.currentStatus === STATUS_OPTIONS.MESSY_BED) {
      this.notifications.push({
        type: 'messy_bed',
        priority: PRIORITY_LEVELS.MESSY_BED,
        message: '🛏️ Netvarkinga lova',
        timestamp: this.lastCheckedTime,
        bedId: this.bedId
      });
    }

    // Priority 2: Missing equipment
    if (this.currentStatus === STATUS_OPTIONS.MISSING_EQUIPMENT) {
      this.notifications.push({
        type: 'missing_equipment',
        priority: PRIORITY_LEVELS.MISSING_EQUIPMENT,
        message: '🧰 Trūksta priemonių',
        timestamp: this.lastCheckedTime,
        bedId: this.bedId
      });
    }

    // Priority 3: Other problem
    if (this.currentStatus === STATUS_OPTIONS.OTHER && this.problemDescription) {
      this.notifications.push({
        type: 'other_problem',
        priority: PRIORITY_LEVELS.OTHER_PROBLEM,
        message: `⚠️ Kita problema: ${this.problemDescription}`,
        timestamp: this.lastCheckedTime,
        bedId: this.bedId
      });
    }

    // Priority 4: Recently freed (needs cleaning)
    if (this.lastFreedTime) {
      const hoursSinceFreed = (now - this.lastFreedTime) / (1000 * 60 * 60);
      if (hoursSinceFreed <= settings.recentlyFreedThreshold) {
        this.notifications.push({
          type: 'recently_freed',
          priority: PRIORITY_LEVELS.RECENTLY_FREED,
          message: '🧹 Ką tik atlaisvinta - reikia sutvarkyti',
          timestamp: this.lastFreedTime,
          bedId: this.bedId,
          hoursSinceFreed
        });
      }
    }

    // Priority 5: Regular check needed for occupied beds
    if (this.occupancyStatus === 'occupied' && this.lastCheckedTime) {
      const hoursSinceLastCheck = (now - this.lastCheckedTime) / (1000 * 60 * 60);
      if (hoursSinceLastCheck >= settings.checkIntervalOccupied) {
        this.notifications.push({
          type: 'regular_check',
          priority: PRIORITY_LEVELS.REGULAR_CHECK,
          message: '⏰ Reikia patikrinti užimtą lovą',
          timestamp: this.lastCheckedTime,
          bedId: this.bedId,
          hoursSinceLastCheck
        });
      }
    }

    // Sort notifications by priority
    this.notifications.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Clear all notifications
   */
  clearNotifications() {
    this.notifications = [];
  }

  /**
   * Get status color class for UI
   */
  getStatusColorClass() {
    switch (this.currentStatus) {
      case STATUS_OPTIONS.CLEAN:
        return 'clean';
      case STATUS_OPTIONS.MESSY_BED:
        return 'dirty';
      case STATUS_OPTIONS.MISSING_EQUIPMENT:
        return 'dirty';
      case STATUS_OPTIONS.OTHER:
        return 'dirty';
      default:
        return 'clean';
    }
  }

  /**
   * Get occupancy color class for UI
   */
  getOccupancyColorClass() {
    return this.occupancyStatus === 'occupied' ? 'occupied' : 'clean';
  }

  /**
   * Get hours since last check
   */
  getHoursSinceLastCheck() {
    if (!this.lastCheckedTime) return null;
    return (new Date() - this.lastCheckedTime) / (1000 * 60 * 60);
  }

  /**
   * Get hours since freed
   */
  getHoursSinceFreed() {
    if (!this.lastFreedTime) return null;
    return (new Date() - this.lastFreedTime) / (1000 * 60 * 60);
  }
}

/**
 * Main data manager for all beds
 */
export class BedDataManager {
  constructor() {
    this.beds = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.formResponses = [];
    this.occupancyData = [];
    this.formResponseIndex = new Map();
    this.occupancyRecordIndex = new Map();

    // Initialize all beds
    BED_LAYOUT.forEach(bedId => {
      this.beds.set(bedId, new BedData(bedId));
    });
  }

  #resetBedState(bed) {
    bed.currentStatus = STATUS_OPTIONS.CLEAN;
    bed.occupancyStatus = 'free';
    bed.lastOccupiedTime = null;
    bed.lastFreedTime = null;
    bed.lastCheckedTime = null;
    bed.lastCheckedBy = null;
    bed.lastCheckedEmail = null;
    bed.problemDescription = null;
    bed.notifications = [];
    bed.history = [];
  }

  applyAggregatedState(records = []) {
    if (!Array.isArray(records)) {
      return;
    }

    this.formResponses = [];
    this.occupancyData = [];
    this.formResponseIndex.clear();
    this.occupancyRecordIndex.clear();

    this.beds.forEach((bed) => {
      this.#resetBedState(bed);
    });

    records.forEach((record) => {
      if (!record) return;
      const bedId = record.bedId ?? record.label;
      if (!bedId) return;
      const bed = this.beds.get(bedId);
      if (!bed) {
        return;
      }

      if (record.status) {
        bed.currentStatus = record.status;
        bed.problemDescription = record.statusNotes ?? record.statusMetadata?.description ?? null;
        const statusDate = parseSupabaseTimestamp(record.statusCreatedAt);
        bed.lastCheckedTime = statusDate;
        bed.lastCheckedBy = record.statusReportedBy ?? null;
        bed.lastCheckedEmail = record.statusReportedBy ?? null;
      }

      if (record.occupancyState) {
        const normalized = String(record.occupancyState).toLowerCase();
        const occupancyDate = parseSupabaseTimestamp(record.occupancyCreatedAt);
        if (normalized === 'occupied') {
          bed.occupancyStatus = 'occupied';
          bed.lastOccupiedTime = occupancyDate;
        } else if (normalized === 'free' || normalized === 'available') {
          bed.occupancyStatus = 'free';
          bed.lastFreedTime = occupancyDate;
        } else {
          bed.occupancyStatus = normalized;
        }
      } else {
        bed.occupancyStatus = 'free';
      }

      bed.calculateNotifications(this.settings);
    });

    this.beds.forEach((bed) => {
      bed.calculateNotifications(this.settings);
    });
  }

  /**
   * Add form response and update bed data
   */
  addFormResponse(formResponse, options = {}) {
    const { allowUpdate = false } = options;
    const recordId = formResponse?.id ?? `${formResponse?.bedId ?? 'unknown'}-${formResponse?.timestamp ?? Date.now()}`;
    const existingIndex = recordId !== undefined ? this.formResponseIndex.get(recordId) : undefined;

    if (typeof existingIndex === 'number') {
      if (!allowUpdate) {
        return false;
      }
      this.formResponses[existingIndex] = formResponse;
    } else {
      this.formResponses.push(formResponse);
      if (recordId) {
        this.formResponseIndex.set(recordId, this.formResponses.length - 1);
      }
    }
    const bed = this.beds.get(formResponse.bedId);
    if (bed) {
      bed.updateStatus(formResponse);
      bed.calculateNotifications(this.settings);
    }
    return true;
  }

  /**
   * Add occupancy data and update bed data
   */
  addOccupancyData(occupancyData, options = {}) {
    const { allowUpdate = false } = options;
    const recordId = occupancyData?.id ?? `${occupancyData?.bedId ?? 'unknown'}-${occupancyData?.timestamp ?? Date.now()}`;
    const existingIndex = recordId !== undefined ? this.occupancyRecordIndex.get(recordId) : undefined;

    if (typeof existingIndex === 'number') {
      if (!allowUpdate) {
        return false;
      }
      this.occupancyData[existingIndex] = occupancyData;
    } else {
      this.occupancyData.push(occupancyData);
      if (recordId) {
        this.occupancyRecordIndex.set(recordId, this.occupancyData.length - 1);
      }
    }
    const bed = this.beds.get(occupancyData.bedId);
    if (bed) {
      bed.updateOccupancy(occupancyData);
      bed.calculateNotifications(this.settings);
    }
    return true;
  }

  /**
   * Update settings and recalculate all notifications
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.beds.forEach(bed => {
      bed.calculateNotifications(this.settings);
    });
  }

  /**
   * Get all beds as array
   */
  getAllBeds() {
    return Array.from(this.beds.values());
  }

  /**
   * Get beds with notifications, sorted by priority
   */
  getBedsWithNotifications() {
    const bedsWithNotifications = this.getAllBeds()
      .filter(bed => bed.notifications.length > 0)
      .sort((a, b) => {
        const aPriority = Math.min(...a.notifications.map(n => n.priority));
        const bPriority = Math.min(...b.notifications.map(n => n.priority));
        return aPriority - bPriority;
      });
    
    return bedsWithNotifications;
  }

  /**
   * Get statistics for KPI display
   */
  getStatistics() {
    const beds = this.getAllBeds();
    const now = new Date();
    
    return {
      totalBeds: beds.length,
      cleanBeds: beds.filter(b => b.currentStatus === STATUS_OPTIONS.CLEAN).length,
      messyBeds: beds.filter(b => b.currentStatus === STATUS_OPTIONS.MESSY_BED).length,
      missingEquipment: beds.filter(b => b.currentStatus === STATUS_OPTIONS.MISSING_EQUIPMENT).length,
      otherProblems: beds.filter(b => b.currentStatus === STATUS_OPTIONS.OTHER).length,
      occupiedBeds: beds.filter(b => b.occupancyStatus === 'occupied').length,
      freeBeds: beds.filter(b => b.occupancyStatus === 'free').length,
      bedsNeedingCheck: beds.filter(b => {
        if (b.occupancyStatus === 'occupied' && b.lastCheckedTime) {
          const hoursSinceCheck = (now - b.lastCheckedTime) / (1000 * 60 * 60);
          return hoursSinceCheck >= this.settings.checkIntervalOccupied;
        }
        return false;
      }).length,
      recentlyFreedBeds: beds.filter(b => {
        if (b.lastFreedTime) {
          const hoursSinceFreed = (now - b.lastFreedTime) / (1000 * 60 * 60);
          return hoursSinceFreed <= this.settings.recentlyFreedThreshold;
        }
        return false;
      }).length
    };
  }

  /**
   * Export data for backup/export
   */
  exportData() {
    return {
      settings: this.settings,
      formResponses: this.formResponses,
      occupancyData: this.occupancyData,
      exportTimestamp: new Date().toISOString()
    };
  }

  /**
   * Import data from backup/export
   */
  importData(data) {
    if (data.settings) {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }

    if (data.formResponses) {
      this.formResponses = [];
      this.formResponseIndex.clear();
      // Rebuild bed data from form responses
      this.beds.clear();
      BED_LAYOUT.forEach(bedId => {
        this.beds.set(bedId, new BedData(bedId));
      });
      data.formResponses
        .slice()
        .sort((a, b) => new Date(a.timestamp ?? 0) - new Date(b.timestamp ?? 0))
        .forEach(response => {
          this.addFormResponse(response);
        });
    }

    if (data.occupancyData) {
      this.occupancyData = [];
      this.occupancyRecordIndex.clear();
      data.occupancyData
        .slice()
        .sort((a, b) => new Date(a.timestamp ?? 0) - new Date(b.timestamp ?? 0))
        .forEach(occupancy => {
          this.addOccupancyData(occupancy);
        });
    }
  }
}
