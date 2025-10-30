import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { NotificationManager } from '../notifications/notificationManager.js';
import { DEFAULT_SETTINGS } from '../models/bedData.js';

class FakeSettingsManager {
  constructor(overrides = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...overrides };
    this.listeners = [];
  }

  addListener(listener) {
    this.listeners.push(listener);
    listener(this.settings);
  }

  getSettings() {
    return this.settings;
  }
}

describe('NotificationManager su bendromis užduotimis', () => {
  let dom;
  let notificationManager;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><body>
      <div id="alerts" class="hidden"></div>
      <div id="notificationSummary"></div>
    </body>`, { url: 'http://localhost' });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Notification = class {
      static permission = 'denied';
      static requestPermission = vi.fn();
    };

    notificationManager = new NotificationManager(new FakeSettingsManager({
      soundEnabled: true,
      notificationsEnabled: false,
    }));
    vi.spyOn(notificationManager, 'playNotificationSound').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.Notification;
  });

  it('išskiria kritines užduotis ir įjungia garso signalą', () => {
    const criticalTask = {
      id: 'task-1',
      title: 'Laboratoriniai mėginiai',
      description: 'Išsiųsti mėginius į laboratoriją',
      priority: 1,
      dueAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: 'planned',
      channel: 'laboratory',
      channelLabel: 'Laboratorija',
      responsible: 'Kurjeris',
    };

    notificationManager.updateNotifications([], [criticalTask]);

    expect(notificationManager.playNotificationSound).toHaveBeenCalledWith(expect.objectContaining({ hasCriticalTaskChange: true }));

    const summary = document.querySelector('.notification-task-summary');
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('Laboratoriniai mėginiai');

    const alerts = document.getElementById('alerts');
    expect(alerts.classList.contains('hidden')).toBe(false);
    expect(alerts.textContent).toContain('Kritinės užduotys');
  });

  it('grupuoja užduotis pagal prioritetą ir SLA', () => {
    const tasks = [
      {
        id: 'task-crit',
        title: 'Skubi laboratorija',
        priority: 1,
        dueAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: 'inProgress',
        channel: 'laboratory',
      },
      {
        id: 'task-medium',
        title: 'Komunikacijos užduotis',
        priority: 3,
        dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        status: 'planned',
        channel: 'communication',
      },
    ];

    notificationManager.updateNotifications([], tasks, { suppressAlerts: true });

    const items = [...document.querySelectorAll('.notification-task')];
    expect(items).toHaveLength(2);
    const overdue = items.find((item) => item.textContent.includes('Skubi laboratorija'));
    expect(overdue.textContent).toMatch(/Prieš/);
  });
});
