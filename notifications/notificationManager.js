/**
 * Notification system for bed cleanliness management
 */

import { PRIORITY_LEVELS } from '../models/bedData.js';

export class NotificationManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.notifications = [];
    this.lastNotificationIds = new Set();
    this.audioContext = null;
    this.soundEnabled = true;
    
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
    const { suppressAlerts = false } = options;
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
    this.renderNotificationDisplay(beds);
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
  renderNotificationDisplay(beds) {
    const notificationContainer = document.getElementById('notificationSummary');
    if (!notificationContainer) return;
    
    const bedsWithNotifications = beds.filter(bed => bed.notifications.length > 0);
    
    if (bedsWithNotifications.length === 0) {
      notificationContainer.innerHTML = '<div class="text-green-600 dark:text-green-400">✅ Visos lovos tvarkingos</div>';
      return;
    }
    
    // Sort by priority
    bedsWithNotifications.sort((a, b) => {
      const aPriority = Math.min(...a.notifications.map(n => n.priority));
      const bPriority = Math.min(...b.notifications.map(n => n.priority));
      return aPriority - bPriority;
    });
    
    const notificationHTML = bedsWithNotifications.map(bed => {
      const highestPriorityNotification = bed.notifications[0];
      const priorityClass = this.getPriorityClass(highestPriorityNotification.priority);
      
      return `
        <div class="notification-item ${priorityClass} p-2 rounded border-l-4 mb-2">
          <div class="flex justify-between items-start">
            <div>
              <span class="font-semibold">Lova ${bed.bedId}</span>
              <div class="text-sm">${highestPriorityNotification.message}</div>
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              ${this.formatTime(highestPriorityNotification.timestamp)}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    notificationContainer.innerHTML = notificationHTML;
  }

  /**
   * Get CSS class for priority level
   */
  getPriorityClass(priority) {
    if (priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
      return 'bg-red-50 border-red-400 text-red-800 dark:bg-red-900/20 dark:border-red-500 dark:text-red-200';
    } else if (priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
      return 'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-500 dark:text-yellow-200';
    } else {
      return 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-200';
    }
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
}
