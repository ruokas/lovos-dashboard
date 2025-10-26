/**
 * Notification system for bed cleanliness management
 */

import { PRIORITY_LEVELS } from '../models/bedData.js';
import { clampFontSizeLevel, applyFontSizeClasses } from '../utils/fontSize.js';
import { t, texts } from '../texts.js';

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

export class NotificationManager {
  constructor(settingsManager, options = {}) {
    this.settingsManager = settingsManager;
    this.notifications = [];
    this.lastNotificationIds = new Set();
    this.audioContext = null;
    this.soundEnabled = true;
    this.fontSizeLevel = clampFontSizeLevel(options.fontSizeLevel ?? 0);
    
    // Initialize audio context
    this.initAudio();
    
    // Listen for settings changes
    this.settingsManager.addListener((settings) => {
      this.soundEnabled = settings.soundEnabled;
    });
  }

  /**
   * Initialize audio context for sound notifications
   */
  initAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context not supported:', error);
    }
  }

  /**
   * Update notifications from bed data
   */
  updateNotifications(beds, options = {}) {
    const { suppressAlerts = false, fontSizeLevel } = options;
    if (typeof fontSizeLevel === 'number') {
      this.fontSizeLevel = clampFontSizeLevel(fontSizeLevel);
    }
    const newNotifications = [];
    const currentNotificationIds = new Set();

    beds.forEach(bed => {
      bed.notifications.forEach(notification => {
        const notificationId = `${bed.bedId}-${notification.type}`;
        currentNotificationIds.add(notificationId);
        
        // Check if this is a new notification
        if (!this.lastNotificationIds.has(notificationId)) {
          newNotifications.push({
            ...notification,
            id: notificationId,
            bedId: bed.bedId,
            timestamp: new Date()
          });
        }
      });
    });

    // Update stored notification IDs
    this.lastNotificationIds = currentNotificationIds;

    // Show new notifications
    if (!suppressAlerts && newNotifications.length > 0) {
      this.showNotifications(newNotifications);
    }
    
    // Update notification display
    this.renderNotificationDisplay(beds, { fontSizeLevel: this.fontSizeLevel });
  }

  /**
   * Show new notifications
   */
  showNotifications(notifications) {
    if (typeof window === 'undefined') return;

    // Play sound if enabled
    if (this.soundEnabled && notifications.length > 0) {
      this.playNotificationSound();
    }

    // Show browser notification if supported and enabled
    if (this.settingsManager.getSettings().notificationsEnabled && 'Notification' in window) {
      this.showBrowserNotifications(notifications);
    }
    
    // Show in-app notifications
    this.showInAppNotifications(notifications);
  }

  /**
   * Play notification sound
   */
  playNotificationSound() {
    if (!this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }

  /**
   * Show browser notifications
   */
  showBrowserNotifications(notifications) {
    if (Notification.permission === 'granted') {
      notifications.forEach(notification => {
        new Notification(`Lova ${notification.bedId}`, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id
        });
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          this.showBrowserNotifications(notifications);
        }
      });
    }
  }

  /**
   * Show in-app notifications
   */
  showInAppNotifications(notifications) {
    const alertContainer = document.getElementById('alerts');
    if (!alertContainer) return;
    
    // Group notifications by priority
    const groupedNotifications = this.groupNotificationsByPriority(notifications);
    
    // Create alert message
    const messages = [];
    if (groupedNotifications.high.length > 0) {
      messages.push(`🚨 Kritinės problemos: ${groupedNotifications.high.length}`);
    }
    if (groupedNotifications.medium.length > 0) {
      messages.push(`⚠️ Vidutinės problemos: ${groupedNotifications.medium.length}`);
    }
    if (groupedNotifications.low.length > 0) {
      messages.push(`ℹ️ Patikrinimai: ${groupedNotifications.low.length}`);
    }
    
    if (messages.length > 0) {
      alertContainer.textContent = messages.join(' • ');
      alertContainer.classList.remove('hidden');
      alertContainer.setAttribute('data-priority', groupedNotifications.high.length > 0 ? 'high' : 'medium');
      
      // Auto-hide after 10 seconds
      setTimeout(() => {
        alertContainer.classList.add('hidden');
      }, 10000);
    }
  }

  /**
   * Group notifications by priority
   */
  groupNotificationsByPriority(notifications) {
    return notifications.reduce((groups, notification) => {
      if (notification.priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
        groups.high.push(notification);
      } else if (notification.priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
        groups.medium.push(notification);
      } else {
        groups.low.push(notification);
      }
      return groups;
    }, { high: [], medium: [], low: [] });
  }

  /**
   * Render notification display in the UI
   */
  renderNotificationDisplay(beds, options = {}) {
    const notificationContainer = document.getElementById('notificationSummary');
    if (!notificationContainer) return;

    const level = typeof options.fontSizeLevel === 'number'
      ? clampFontSizeLevel(options.fontSizeLevel)
      : this.fontSizeLevel;

    const bedsWithNotifications = beds
      .filter(bed => bed.notifications.length > 0)
      .map((bed) => ({
        ...bed,
        notifications: [...bed.notifications].sort((a, b) => a.priority - b.priority),
      }));

    if (bedsWithNotifications.length === 0) {
      notificationContainer.innerHTML = `
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-900/30 dark:text-emerald-100 ${applyFontSizeClasses('text-sm font-medium', level)}">
          ${escapeHtml(t(texts.notifications.allClear))}
        </div>
      `;
      return;
    }

    bedsWithNotifications.sort((a, b) => {
      const aPriority = Math.min(...a.notifications.map(n => n.priority));
      const bPriority = Math.min(...b.notifications.map(n => n.priority));
      return aPriority - bPriority;
    });

    const cards = bedsWithNotifications.map((bed) => {
      const highestPriority = bed.notifications[0];
      const borderClass = this.getCardBorderClass(highestPriority.priority);
      const occupancyBadge = bed.occupancyStatus === 'occupied'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100';
      const occupancyText = bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva';
      const lastCheckedTime = bed.lastCheckedTime instanceof Date && !Number.isNaN(bed.lastCheckedTime)
        ? bed.lastCheckedTime.toLocaleString('lt-LT')
        : t(texts.ui.noData);
      const lastCheckedBy = bed.lastCheckedBy ? bed.lastCheckedBy : t(texts.ui.unknownUser);

      const notifications = bed.notifications.map((notification) => {
        const badgeClass = this.getPriorityClass(notification.priority);
        const message = escapeHtml(notification.message ?? '');
        const relativeTime = notification.timestamp ? this.formatTime(notification.timestamp) : '';
        return `
          <div class="flex items-center justify-between gap-2 rounded-md px-2 py-1 ${badgeClass}">
            <span class="${applyFontSizeClasses('text-xs font-semibold', level)}">${message}</span>
            <span class="${applyFontSizeClasses('text-[10px] font-medium', level)} text-slate-600 dark:text-slate-300">${escapeHtml(relativeTime)}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="rounded-lg border ${borderClass} bg-white dark:bg-slate-900/40 p-3 transition hover:border-blue-400 hover:shadow-sm cursor-pointer" data-bed-id="${escapeHtml(bed.bedId)}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="${applyFontSizeClasses('text-sm font-semibold text-slate-900 dark:text-slate-100', level)}">${escapeHtml(`${t(texts.ui.bedLabel)} ${bed.bedId}`)}</span>
              <span class="rounded-md px-2 py-0.5 ${applyFontSizeClasses('text-xs font-medium', level)} ${occupancyBadge}">${escapeHtml(occupancyText)}</span>
            </div>
            <div class="${applyFontSizeClasses('text-[11px] text-slate-500 dark:text-slate-400', level)}">
              ${escapeHtml(t(texts.ui.lastChecked))}: ${escapeHtml(lastCheckedTime)} • ${escapeHtml(t(texts.ui.checkedBy))}: ${escapeHtml(lastCheckedBy)}
            </div>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            ${notifications}
          </div>
        </div>
      `;
    }).join('');

    notificationContainer.innerHTML = cards;
  }

  /**
   * Get CSS class for priority level
   */
  getPriorityClass(priority) {
    if (priority <= PRIORITY_LEVELS.MESSY_BED) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
    }
    if (priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-100';
    }
    if (priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-100';
    }
    if (priority <= PRIORITY_LEVELS.RECENTLY_FREED) {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100';
    }
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100';
  }

  getCardBorderClass(priority) {
    if (priority <= PRIORITY_LEVELS.MESSY_BED) {
      return 'border-red-300 dark:border-red-500/70';
    }
    if (priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
      return 'border-amber-300 dark:border-amber-500/70';
    }
    if (priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
      return 'border-orange-300 dark:border-orange-500/70';
    }
    if (priority <= PRIORITY_LEVELS.RECENTLY_FREED) {
      return 'border-emerald-300 dark:border-emerald-500/70';
    }
    return 'border-blue-300 dark:border-blue-500/70';
  }

  /**
   * Format timestamp for display
   */
  formatTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) {
      return 'Dabar';
    } else if (diffMins < 60) {
      return `Prieš ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Prieš ${diffHours} val`;
    } else {
      return time.toLocaleDateString('lt-LT');
    }
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications() {
    this.lastNotificationIds.clear();
    const alertContainer = document.getElementById('alerts');
    if (alertContainer) {
      alertContainer.classList.add('hidden');
    }
  }

  /**
   * Get notification statistics
   */
  getNotificationStats(beds) {
    const stats = {
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
      byType: {}
    };
    
    beds.forEach(bed => {
      bed.notifications.forEach(notification => {
        stats.total++;
        
        if (notification.priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
          stats.high++;
        } else if (notification.priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
          stats.medium++;
        } else {
          stats.low++;
        }
        
        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      });
    });
    
    return stats;
  }

  setFontSizeLevel(level) {
    this.fontSizeLevel = clampFontSizeLevel(level);
  }
}
