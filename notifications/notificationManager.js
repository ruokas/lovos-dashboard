/**
 * Notification system for bed cleanliness management
 */

import { PRIORITY_LEVELS } from '../models/bedData.js';
import { TASK_PRIORITIES, TASK_STATUSES, mergeRecurringTasksForDisplay } from '../models/taskData.js';
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
    this.notificationTimestamps = new Map();
    this.currentTasks = [];
    this.lastCriticalTaskSnapshot = new Map();
    this.audioContext = null;
    this.soundEnabled = true;
    this.fontSizeLevel = clampFontSizeLevel(options.fontSizeLevel ?? 0);
    this.onTaskComplete = typeof options.onTaskComplete === 'function' ? options.onTaskComplete : null;
    this.boundTaskActionHandler = (event) => this.handleTaskAction(event);
    this.taskActionListenerAttached = false;
    
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
  updateNotifications(beds, tasks = [], options = {}) {
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

        if (!this.notificationTimestamps.has(notificationId)) {
          const sourceTimestamp = notification.timestamp
            ? new Date(notification.timestamp)
            : new Date();
          this.notificationTimestamps.set(notificationId, sourceTimestamp);
        }

        const storedTimestamp = this.notificationTimestamps.get(notificationId);

        // Check if this is a new notification
        if (!this.lastNotificationIds.has(notificationId)) {
          newNotifications.push({
            ...notification,
            id: notificationId,
            bedId: bed.bedId,
            timestamp: storedTimestamp || new Date()
          });
        }
      });
    });

    // Update stored notification IDs
    this.lastNotificationIds = currentNotificationIds;

    // Remove timestamps for cleared notifications
    Array.from(this.notificationTimestamps.keys()).forEach((notificationId) => {
      if (!currentNotificationIds.has(notificationId)) {
        this.notificationTimestamps.delete(notificationId);
      }
    });

    const { normalizedTasks, hasCriticalTaskChange } = this.updateTaskAlerts(tasks);

    // Show new notifications or task alerts
    if (!suppressAlerts && (newNotifications.length > 0 || hasCriticalTaskChange)) {
      this.showNotifications(newNotifications, { hasCriticalTaskChange, tasks: normalizedTasks });
    }

    // Update notification display
    this.renderNotificationDisplay(beds, {
      fontSizeLevel: this.fontSizeLevel,
      tasks: normalizedTasks,
    });
  }

  /**
   * Show new notifications
   */
  showNotifications(notifications, options = {}) {
    if (typeof window === 'undefined') return;

    // Play sound if enabled
    const shouldPlaySound = this.soundEnabled && (notifications.length > 0 || options.hasCriticalTaskChange);
    if (shouldPlaySound) {
      this.playNotificationSound({ hasCriticalTaskChange: options.hasCriticalTaskChange });
    }

    // Show browser notification if supported and enabled
    if (this.settingsManager.getSettings().notificationsEnabled && 'Notification' in window) {
      this.showBrowserNotifications(notifications);
    }
    
    // Show in-app notifications
    const taskSummary = Array.isArray(options.tasks) ? options.tasks : this.currentTasks;
    this.showInAppNotifications(notifications, { tasks: taskSummary, hasCriticalTaskChange: options.hasCriticalTaskChange });
  }

  /**
   * Play notification sound
   */
  playNotificationSound(options = {}) {
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

      if (options.hasCriticalTaskChange) {
        const taskOscillator = this.audioContext.createOscillator();
        const taskGain = this.audioContext.createGain();
        taskOscillator.connect(taskGain);
        taskGain.connect(this.audioContext.destination);
        const startTime = this.audioContext.currentTime + 0.22;
        taskOscillator.frequency.setValueAtTime(950, startTime);
        taskOscillator.frequency.exponentialRampToValueAtTime(700, startTime + 0.18);
        taskGain.gain.setValueAtTime(0.25, startTime);
        taskGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
        taskOscillator.start(startTime);
        taskOscillator.stop(startTime + 0.22);
      }
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
  showInAppNotifications(notifications, options = {}) {
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

    const tasks = Array.isArray(options.tasks)
      ? options.tasks.filter((task) => this.shouldDisplayTaskAsCard(task))
      : [];
    const criticalTasks = tasks.filter((task) => task.priorityBucket === 'critical');
    const overdueTasks = tasks.filter((task) => task.isOverdue);
    if (criticalTasks.length > 0) {
      messages.push(`🧪 Kritinės užduotys: ${criticalTasks.length}`);
    }
    if (overdueTasks.length > 0 && overdueTasks.length !== criticalTasks.length) {
      messages.push(`⏰ Vėluoja: ${overdueTasks.length}`);
    }

    if (messages.length > 0) {
      alertContainer.textContent = messages.join(' • ');
      alertContainer.classList.remove('hidden');
      const hasHighBeds = groupedNotifications.high.length > 0;
      const hasMediumBeds = groupedNotifications.medium.length > 0;
      const hasCriticalTasks = criticalTasks.length > 0;
      const hasOverdueTasks = overdueTasks.length > 0;
      const priorityLevel = hasHighBeds || hasCriticalTasks
        ? 'high'
        : (hasMediumBeds || hasOverdueTasks ? 'medium' : 'low');
      alertContainer.setAttribute('data-priority', priorityLevel);

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

  updateTaskAlerts(tasks) {
    if (!Array.isArray(tasks)) {
      this.currentTasks = [];
      this.lastCriticalTaskSnapshot.clear();
      return { normalizedTasks: [], hasCriticalTaskChange: false };
    }

    const preparedTasks = mergeRecurringTasksForDisplay(tasks);

    const normalizedTasks = preparedTasks
      .map((task) => this.normaliseTaskForSummary(task))
      .filter(Boolean)
      .sort((a, b) => {
        const bucketOrder = ['critical', 'high', 'medium', 'low', 'none'];
        const bucketDiff = bucketOrder.indexOf(a.priorityBucket) - bucketOrder.indexOf(b.priorityBucket);
        if (bucketDiff !== 0) {
          return bucketDiff;
        }
        if (a.dueTimestamp !== b.dueTimestamp) {
          if (a.dueTimestamp === null) return 1;
          if (b.dueTimestamp === null) return -1;
          return a.dueTimestamp - b.dueTimestamp;
        }
        return a.title.localeCompare(b.title, 'lt-LT');
      });

    const criticalTasks = normalizedTasks.filter((task) => task.priorityBucket === 'critical');
    const snapshot = new Map(criticalTasks.map((task) => [task.id, `${task.priorityBucket}:${task.dueIso ?? 'none'}`]));
    let hasCriticalTaskChange = false;
    for (const [id, value] of snapshot.entries()) {
      const previous = this.lastCriticalTaskSnapshot.get(id);
      if (previous !== value) {
        hasCriticalTaskChange = true;
        break;
      }
    }

    this.currentTasks = normalizedTasks;
    this.lastCriticalTaskSnapshot = snapshot;
    return { normalizedTasks, hasCriticalTaskChange };
  }

  normaliseTaskForSummary(task) {
    if (!task || typeof task !== 'object') {
      return null;
    }

    const now = new Date();
    let generatedId = null;
    if (typeof task.id === 'string' && task.id) {
      generatedId = task.id;
    } else if (typeof task.seriesId === 'string' && task.seriesId) {
      generatedId = task.seriesId;
    } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      generatedId = crypto.randomUUID();
    } else {
      generatedId = `task-${Math.random().toString(36).slice(2, 11)}`;
    }
    const id = String(generatedId);
    const typeValue = typeof task.type === 'string' ? task.type : (task.metadata?.type ?? 'task');
    const typeLabel = typeof task.typeLabel === 'string'
      ? task.typeLabel
      : (task.metadata?.typeLabel ?? typeValue);
    const title = task.title
      ?? typeLabel
      ?? typeValue
      ?? t(texts.tasks?.title) ?? 'Užduotis';
    const description = typeof task.description === 'string' ? task.description : '';
    const zone = task.zoneLabel ?? task.channelLabel ?? task.zone ?? task.channel ?? '';
    const zoneKey = typeof task.zone === 'string' ? task.zone : '';
    const channelKey = typeof task.channel === 'string' ? task.channel : '';
    const responsible = task.responsible ?? '';
    const priority = Number.isFinite(task.priority) ? task.priority : TASK_PRIORITIES.MEDIUM;
    const priorityBucket = this.getTaskPriorityBucket(priority);
    const dueSource = task.dueAt ?? task.deadline ?? null;
    const dueDate = dueSource ? new Date(dueSource) : null;
    const dueValid = dueDate instanceof Date && !Number.isNaN(dueDate?.getTime?.());
    const dueIso = dueValid ? dueDate.toISOString() : null;
    const dueAbsolute = dueValid ? dueDate.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : null;
    const dueRelative = dueValid ? this.formatRelativeTime(dueDate) : null;
    const dueTimestamp = dueValid ? dueDate.getTime() : null;
    const isCompleted = task.status === TASK_STATUSES.COMPLETED;
    const isOverdue = Boolean(dueValid && !isCompleted && dueDate.getTime() < now.getTime());
    const recurrenceLabel = typeof task.recurrenceLabel === 'string' ? task.recurrenceLabel : null;

    return {
      id,
      title,
      description,
      zone,
      responsible,
      priority,
      priorityBucket,
      dueIso,
      dueAbsolute,
      dueRelative,
      dueTimestamp,
      isOverdue,
      status: task.status ?? TASK_STATUSES.PLANNED,
      source: task.source ?? 'local',
      recurrenceLabel,
      priority,
      priorityValue: priority,
      type: typeValue,
      typeLabel,
      zoneKey,
      channelKey,
      seriesId: typeof task.seriesId === 'string' && task.seriesId ? task.seriesId : null,
      metadata: task.metadata ? { ...task.metadata } : {},
    };
  }

  getTaskPriorityBucket(priority) {
    if (priority <= TASK_PRIORITIES.CRITICAL) {
      return 'critical';
    }
    if (priority <= TASK_PRIORITIES.HIGH) {
      return 'high';
    }
    if (priority <= TASK_PRIORITIES.MEDIUM) {
      return 'medium';
    }
    if (priority <= TASK_PRIORITIES.LOW) {
      return 'low';
    }
    return 'none';
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

    const taskSource = Array.isArray(options.tasks) ? options.tasks : this.currentTasks;
    const hasNormalizedShape = Array.isArray(taskSource)
      && taskSource.every((task) => task && typeof task === 'object' && 'priorityBucket' in task);
    const summaryTasks = hasNormalizedShape
      ? taskSource
      : mergeRecurringTasksForDisplay(taskSource).map((task) => this.normaliseTaskForSummary(task)).filter(Boolean);

    const streamTasks = summaryTasks.filter((task) => this.shouldDisplayTaskAsCard(task));

    const bedsWithNotifications = beds
      .filter((bed) => bed.notifications.length > 0)
      .map((bed) => {
        const sortedNotifications = [...bed.notifications]
          .sort((a, b) => a.priority - b.priority)
          .map((notification) => {
            const notificationId = `${bed.bedId}-${notification.type}`;
            const storedTimestamp = this.notificationTimestamps.get(notificationId);
            const timestamp = storedTimestamp
              || (notification.timestamp ? new Date(notification.timestamp) : null);

            return {
              ...notification,
              timestamp,
            };
          });

        return {
          ...bed,
          notifications: sortedNotifications,
        };
      });

    const bedEntries = bedsWithNotifications.map((bed, index) => ({
      type: 'bed',
      priorityWeight: Math.min(...bed.notifications.map((notification) => notification.priority)),
      timeWeight: this.getBedOldestTimestamp(bed.notifications),
      markup: this.renderBedCard(bed, { fontSizeLevel: level }),
      index,
    }));

    const generalTaskEntries = streamTasks.map((task, index) => ({
      type: 'task',
      priorityWeight: this.getTaskPriorityWeight(task),
      timeWeight: Number.isFinite(task.dueTimestamp) ? task.dueTimestamp : Number.POSITIVE_INFINITY,
      markup: this.renderGeneralTaskCard(task, { fontSizeLevel: level }),
      index,
    }));

    const combinedEntries = [...bedEntries, ...generalTaskEntries].sort((a, b) => {
      if (a.priorityWeight !== b.priorityWeight) {
        return a.priorityWeight - b.priorityWeight;
      }
      if (a.timeWeight !== b.timeWeight) {
        return a.timeWeight - b.timeWeight;
      }
      return a.index - b.index;
    });

    const streamMarkup = combinedEntries.map((entry) => entry.markup).join('');

    if (!streamMarkup) {
      notificationContainer.innerHTML = `
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-900/30 dark:text-emerald-100 ${applyFontSizeClasses('text-sm font-medium', level)}">
          ${escapeHtml(t(texts.notifications.allClear))}
        </div>
      `;
      return;
    }

    notificationContainer.innerHTML = streamMarkup;

    this.attachTaskActionListeners();
  }

  shouldDisplayTaskAsCard(task) {
    if (!task || typeof task !== 'object') {
      return false;
    }

    if (task.status === TASK_STATUSES.COMPLETED) {
      return false;
    }

    if (this.isGeneralTask(task)) {
      return true;
    }

    const dueTimestamp = Number.isFinite(task.dueTimestamp) ? task.dueTimestamp : null;
    if (dueTimestamp === null) {
      return false;
    }

    const now = Date.now();
    return dueTimestamp <= now;
  }

  attachTaskActionListeners() {
    if (typeof document === 'undefined' || this.taskActionListenerAttached) {
      return;
    }

    const container = document.getElementById('notificationSummary');
    if (!container) {
      return;
    }

    container.addEventListener('click', this.boundTaskActionHandler);
    container.addEventListener('keydown', this.boundTaskActionHandler);
    this.taskActionListenerAttached = true;
  }

  handleTaskAction(event) {
    if (!this.onTaskComplete) {
      return;
    }

    const isActivationEvent = event.type === 'click'
      || (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' '));
    if (!isActivationEvent) {
      return;
    }

    const rawTarget = event.target;
    const elementTarget = rawTarget && typeof rawTarget === 'object'
      ? (typeof rawTarget.closest === 'function'
        ? rawTarget
        : rawTarget.parentElement ?? null)
      : null;
    const target = typeof elementTarget?.closest === 'function'
      ? elementTarget.closest('button[data-action="complete-task"]')
      : null;
    if (!target) {
      return;
    }

    if (event.type === 'keydown') {
      event.preventDefault();
    }

    const taskId = target.dataset.taskId || '';
    const seriesId = target.dataset.seriesId || '';
    if (!taskId && !seriesId) {
      return;
    }

    if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
      return;
    }

    const originalLabel = target.dataset.originalLabel || target.textContent || '';
    const loadingLabel = target.dataset.loadingLabel || `${t(texts.tasks?.completeAction) || 'Pažymėti kaip atliktą'}…`;
    target.dataset.originalLabel = originalLabel;
    target.textContent = loadingLabel;
    target.disabled = true;
    target.setAttribute('aria-disabled', 'true');
    target.classList.add('is-loading');

    const actionResult = this.onTaskComplete(taskId, seriesId);
    Promise.resolve(actionResult)
      .then((succeeded) => {
        if (succeeded === false) {
          throw new Error('Task completion callback returned false.');
        }
        target.textContent = t(texts.tasks?.completedLabel) || 'Užduotis atlikta';
        target.classList.remove('is-loading');
        target.classList.add('is-completed');
      })
      .catch((error) => {
        console.warn('Nepavyko pažymėti užduoties kaip atliktos iš pranešimo kortelės:', error);
        target.disabled = false;
        target.removeAttribute('aria-disabled');
        target.classList.remove('is-loading');
        target.textContent = originalLabel;
      });
  }

  renderBedCard(bed, options = {}) {
    if (!bed || !Array.isArray(bed.notifications) || bed.notifications.length === 0) {
      return '';
    }

    const level = typeof options.fontSizeLevel === 'number'
      ? clampFontSizeLevel(options.fontSizeLevel)
      : this.fontSizeLevel;

    const highestPriority = bed.notifications[0];
    const cardVariant = this.getNotificationVariant(highestPriority.priority);
    const occupancyVariant = bed.occupancyStatus === 'occupied' ? 'busy' : 'free';
    const occupancyText = bed.occupancyStatus === 'occupied' ? 'Užimta' : 'Laisva';

    const notifications = bed.notifications.map((notification) => {
      const issueVariant = this.getNotificationVariant(notification.priority);
      const { title, body } = this.parseNotificationMessage(notification.message);
      const timeInfo = notification.timestamp ? this.formatTimestamp(notification.timestamp) : null;
      const issueTitle = title || 'Pranešimas';
      const timeParts = [];
      if (timeInfo?.absolute) {
        timeParts.push(`<time datetime="${escapeHtml(timeInfo.iso)}">${escapeHtml(timeInfo.absolute)}</time>`);
      }
      if (timeInfo?.relative) {
        timeParts.push(`<span>${escapeHtml(timeInfo.relative)}</span>`);
      }
      const metaMarkup = timeParts.length
        ? `<span class="notification-row__issue-meta ${applyFontSizeClasses('text-sm font-medium', level)}">${timeParts.join('<span class=\"notification-row__meta-separator\" aria-hidden=\"true\">•</span>')}</span>`
        : '';

      return `
        <li class="notification-row__issue" data-variant="${issueVariant}">
          <span class="notification-row__dot" aria-hidden="true"></span>
          <div class="notification-row__issue-content">
            <p class="notification-row__issue-title ${applyFontSizeClasses('text-base font-semibold', level)}">
              <span>${escapeHtml(issueTitle)}</span>
              ${metaMarkup}
            </p>
            ${body ? `<p class="notification-row__issue-body ${applyFontSizeClasses('text-sm', level)}">${escapeHtml(body)}</p>` : ''}
          </div>
        </li>
      `;
    }).join('');

    return `
      <article class="notification-row" data-variant="${cardVariant}" data-bed-id="${escapeHtml(bed.bedId)}">
        <div class="notification-row__bed">
          <span class="notification-row__bed-label ${applyFontSizeClasses('text-sm font-semibold', level)}">${escapeHtml(t(texts.ui.bedLabel))}</span>
          <span class="notification-row__bed-id ${applyFontSizeClasses('text-2xl font-bold', level)}">${escapeHtml(bed.bedId)}</span>
        </div>
        <span class="notification-row__occupancy notification-row__occupancy--${occupancyVariant} ${applyFontSizeClasses('text-sm font-semibold', level)}">${escapeHtml(occupancyText)}</span>
        <ul class="notification-row__issues">
          ${notifications}
        </ul>
      </article>
    `;
  }

  renderGeneralTaskCard(task, options = {}) {
    if (!task || typeof task !== 'object') {
      return '';
    }

    const level = typeof options.fontSizeLevel === 'number'
      ? clampFontSizeLevel(options.fontSizeLevel)
      : this.fontSizeLevel;

    const taskTitle = typeof task.title === 'string' && task.title.trim()
      ? task.title.trim()
      : (typeof task.typeLabel === 'string' && task.typeLabel.trim() ? task.typeLabel.trim() : t(texts.tasks?.title) ?? 'Užduotis');
    const cardVariant = this.getTaskCardVariant(task.priorityBucket);
    const statusVariant = this.getTaskStatusBadgeVariant(task.status);
    const statusLabel = this.getTaskStatusLabel(task.status);
    const headerLabel = typeof task.typeLabel === 'string' && task.typeLabel.trim()
      ? task.typeLabel.trim()
      : (t(texts.notifications?.taskSummaryTitle) || 'Bendra užduotis');

    const patientReference = this.buildPatientReference(task.metadata?.patient);
    const zoneLabel = typeof task.zoneLabel === 'string' && task.zoneLabel.trim()
      ? task.zoneLabel.trim()
      : (typeof task.zone === 'string' ? task.zone : '');
    const defaultHeaderId = typeof taskTitle === 'string' ? taskTitle : (t(texts.common?.dash) || '—');
    const headerId = patientReference
      || (zoneLabel && zoneLabel.toLowerCase() !== 'general' ? zoneLabel : defaultHeaderId);

    const dueParts = [];
    if (task.dueIso && task.dueAbsolute) {
      dueParts.push(`<time datetime="${escapeHtml(task.dueIso)}">${escapeHtml(task.dueAbsolute)}</time>`);
    }
    if (task.dueRelative) {
      dueParts.push(`<span>${escapeHtml(task.dueRelative)}</span>`);
    }
    const overdueClass = task.isOverdue ? 'text-red-600 dark:text-red-300' : '';
    const dueMarkup = dueParts.length
      ? `<span class="notification-row__issue-due ${overdueClass} ${applyFontSizeClasses('text-sm font-medium', level)}">${dueParts.join('<span class=\"notification-row__meta-separator\" aria-hidden=\"true\">•</span>')}</span>`
      : '';

    const descriptionMarkup = task.description
      ? `<span class="notification-row__issue-body ${applyFontSizeClasses('text-sm', level)}">${escapeHtml(task.description)}</span>`
      : '';

    const highlightParts = [];
    if (patientReference) {
      highlightParts.push(`<span>${escapeHtml(patientReference)}</span>`);
    }
    if (zoneLabel && zoneLabel.toLowerCase() !== 'general') {
      highlightParts.push(`<span>${escapeHtml(zoneLabel)}</span>`);
    }
    const highlightMarkup = highlightParts.length
      ? `<span class="notification-task__meta notification-task__meta--highlight ${applyFontSizeClasses('text-sm font-semibold', level)}">${highlightParts.join('<span class=\"notification-task__due-separator\" aria-hidden=\"true\">•</span>')}</span>`
      : '';

    const metaParts = [];
    if (task.responsible) {
      metaParts.push(`<span>${escapeHtml(task.responsible)}</span>`);
    }
    const metaMarkup = metaParts.length
      ? `<span class="notification-task__meta ${applyFontSizeClasses('text-[11px]', level)}">${metaParts.join('<span class=\"notification-task__due-separator\" aria-hidden=\"true\">•</span>')}</span>`
      : '';

    const seriesAttribute = task.seriesId ? ` data-series-id="${escapeHtml(task.seriesId)}"` : '';
    const completionMarkup = task.status === TASK_STATUSES.COMPLETED
      ? `
              <div class="notification-task__footer notification-task__footer--completed ${applyFontSizeClasses('text-xs font-semibold', level)}" role="status">
                <span aria-hidden="true">✅</span>
                <span>${escapeHtml(t(texts.tasks?.completedLabel) || 'Užduotis atlikta')}</span>
              </div>
            `
      : this.onTaskComplete
        ? `
              <div class="notification-task__footer">
                <button type="button" class="notification-task__complete-button ${applyFontSizeClasses('text-xs font-semibold', level)}" data-action="complete-task" data-task-id="${escapeHtml(task.id)}"${seriesAttribute}>
                  ${escapeHtml(t(texts.tasks?.completeAction) || 'Pažymėti kaip atliktą')}
                </button>
              </div>
            `
        : '';

    return `
      <article class="notification-row" data-type="task" data-variant="${cardVariant}" data-task-id="${escapeHtml(task.id)}"${seriesAttribute}>
        <div class="notification-row__bed">
          <span class="notification-row__bed-label ${applyFontSizeClasses('text-sm font-semibold', level)}">${escapeHtml(headerLabel)}</span>
          <span class="notification-row__bed-id ${applyFontSizeClasses('text-2xl font-bold', level)}">${escapeHtml(headerId)}</span>
        </div>
        <span class="notification-row__occupancy notification-row__occupancy--${statusVariant} ${applyFontSizeClasses('text-sm font-semibold', level)}">${escapeHtml(statusLabel)}</span>
        <ul class="notification-row__issues">
          <li class="notification-row__issue" data-variant="${cardVariant}">
            <span class="notification-row__dot" aria-hidden="true"></span>
            <div class="notification-row__issue-content">
              <span class="notification-row__issue-title ${applyFontSizeClasses('text-base font-semibold', level)}">
                <span>${escapeHtml(taskTitle)}</span>
                ${dueMarkup}
              </span>
              ${highlightMarkup}
              ${descriptionMarkup}
              ${metaMarkup}
              ${completionMarkup}
            </div>
          </li>
        </ul>
      </article>
    `;
  }

  getBedOldestTimestamp(notifications = []) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return Number.POSITIVE_INFINITY;
    }

    const timestamps = notifications
      .map((notification) => {
        if (notification?.timestamp instanceof Date) {
          return notification.timestamp.getTime();
        }
        if (notification?.timestamp) {
          const value = new Date(notification.timestamp).getTime();
          return Number.isNaN(value) ? null : value;
        }
        return null;
      })
      .filter((value) => Number.isFinite(value));

    if (!timestamps.length) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.min(...timestamps);
  }

  getTaskPriorityWeight(task) {
    if (!task || typeof task !== 'object') {
      return TASK_PRIORITIES.MEDIUM;
    }

    if (Number.isFinite(task.priorityValue)) {
      return task.priorityValue;
    }

    if (Number.isFinite(task.priority)) {
      return task.priority;
    }

    switch (task.priorityBucket) {
      case 'critical':
        return TASK_PRIORITIES.CRITICAL;
      case 'high':
        return TASK_PRIORITIES.HIGH;
      case 'low':
        return TASK_PRIORITIES.LOW;
      case 'none':
        return TASK_PRIORITIES.LOW + 1;
      case 'medium':
      default:
        return TASK_PRIORITIES.MEDIUM;
    }
  }

  getTaskCardVariant(priorityBucket) {
    switch (priorityBucket) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'warning';
      case 'medium':
        return 'caution';
      case 'low':
        return 'info';
      default:
        return 'neutral';
    }
  }

  getTaskStatusBadgeVariant(status) {
    switch (status) {
      case TASK_STATUSES.COMPLETED:
        return 'completed';
      case TASK_STATUSES.IN_PROGRESS:
        return 'in-progress';
      case TASK_STATUSES.BLOCKED:
        return 'blocked';
      case TASK_STATUSES.PLANNED:
      default:
        return 'planned';
    }
  }

  getTaskStatusLabel(status) {
    const statusKey = typeof status === 'string' ? status : TASK_STATUSES.PLANNED;
    const label = t(texts.tasks?.status?.[statusKey]);
    if (label) {
      return label;
    }
    switch (statusKey) {
      case TASK_STATUSES.COMPLETED:
        return 'Užbaigta';
      case TASK_STATUSES.IN_PROGRESS:
        return 'Vykdoma';
      case TASK_STATUSES.BLOCKED:
        return 'Sustabdyta';
      case TASK_STATUSES.PLANNED:
      default:
        return 'Planuojama';
    }
  }

  buildPatientReference(patientMeta) {
    if (!patientMeta || typeof patientMeta !== 'object') {
      return '';
    }

    const candidates = [
      patientMeta.reference,
      patientMeta.surname,
      patientMeta.chartNumber,
      patientMeta.room,
    ];

    const values = candidates
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value, index, array) => value && array.indexOf(value) === index);

    return values.join(' / ');
  }

  isGeneralTask(task) {
    if (!task || typeof task !== 'object') {
      return false;
    }

    const typeKey = typeof task.type === 'string' ? task.type.toLowerCase() : '';
    const zoneKey = typeof task.zoneKey === 'string' ? task.zoneKey.toLowerCase() : '';
    const channelKey = typeof task.channelKey === 'string' ? task.channelKey.toLowerCase() : '';

    if (typeKey === 'general' || zoneKey === 'general' || channelKey === 'general') {
      return true;
    }

    if (task.metadata && typeof task.metadata === 'object') {
      if (task.metadata.general === true || task.metadata.isGeneral === true) {
        return true;
      }
      const scopeKey = typeof task.metadata.taskScope === 'string'
        ? task.metadata.taskScope.toLowerCase()
        : '';
      if (scopeKey === 'general' || scopeKey === 'shared') {
        return true;
      }
    }

    return false;
  }

  getNotificationVariant(priority) {
    if (priority <= PRIORITY_LEVELS.MESSY_BED) {
      return 'critical';
    }
    if (priority <= PRIORITY_LEVELS.MISSING_EQUIPMENT) {
      return 'warning';
    }
    if (priority <= PRIORITY_LEVELS.OTHER_PROBLEM) {
      return 'caution';
    }
    if (priority <= PRIORITY_LEVELS.RECENTLY_FREED) {
      return 'info';
    }
    return 'neutral';
  }

  parseNotificationMessage(message) {
    const raw = typeof message === 'string' ? message.trim() : '';
    if (!raw) {
      return { title: '', body: '' };
    }
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex === -1) {
      return { title: raw, body: '' };
    }
    const title = raw.slice(0, separatorIndex).trim();
    const body = raw.slice(separatorIndex + 1).trim();
    return { title, body };
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    const time = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(time.getTime())) {
      return null;
    }

    return {
      absolute: time.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
      relative: this.formatRelativeTime(time),
      iso: time.toISOString(),
    };
  }

  /**
   * Create relative time label in Lithuanian
   */
  formatRelativeTime(time) {
    const now = new Date();
    const diffMs = now.getTime() - time.getTime();

    if (diffMs < 0) {
      return 'Neseniai';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'Dabar';
    }

    if (diffMins < 60) {
      return `Prieš ${diffMins} min`;
    }

    if (diffHours < 24) {
      return `Prieš ${diffHours} val`;
    }

    if (diffDays < 7) {
      return `Prieš ${diffDays} d.`;
    }

    return time.toLocaleDateString('lt-LT');
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
