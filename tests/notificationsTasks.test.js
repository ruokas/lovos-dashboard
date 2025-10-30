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
  let completeSpy;

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

    completeSpy = vi.fn(() => true);

    notificationManager = new NotificationManager(new FakeSettingsManager({
      soundEnabled: true,
      notificationsEnabled: false,
    }), {
      onTaskComplete: completeSpy,
    });
    vi.spyOn(notificationManager, 'playNotificationSound').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.Notification;
  });

  it('bendras užduotis rodo kaip korteles ir įjungia garso signalą', () => {
    const criticalTask = {
      id: 'task-1',
      title: 'Laboratoriniai mėginiai',
      description: 'Išsiųsti mėginius į laboratoriją',
      priority: 1,
      dueAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: 'planned',
      zone: 'general',
      zoneLabel: 'Bendras',
      channel: 'general',
      channelLabel: 'Bendras',
      type: 'general',
      typeLabel: 'Bendra užduotis',
      responsible: 'Kurjeris',
      metadata: {
        general: true,
        patient: { reference: 'Petraitis / A123' },
      },
    };

    notificationManager.updateNotifications([], [criticalTask]);

    expect(notificationManager.playNotificationSound).toHaveBeenCalledWith(expect.objectContaining({ hasCriticalTaskChange: true }));

    const taskCard = document.querySelector('.notification-row[data-type="task"]');
    expect(taskCard).not.toBeNull();
    expect(taskCard.textContent).toContain('Laboratoriniai mėginiai');
    expect(document.querySelector('.notification-task-summary')).toBeNull();

    const alerts = document.getElementById('alerts');
    expect(alerts.classList.contains('hidden')).toBe(false);
    expect(alerts.textContent).toContain('Kritinės užduotys');
  });

  it('nerodo pasikartojimo žymės ir paryškina pacientą bei zoną', () => {
    const recurringTask = {
      id: 'task-recur',
      title: 'Patikrink monitorių',
      priority: 2,
      dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: 'inProgress',
      zone: 'monitoring',
      zoneLabel: 'Stebėjimo zona',
      channel: 'monitoring',
      channelLabel: 'Stebėjimo zona',
      type: 'general',
      typeLabel: 'Bendra užduotis',
      recurrence: 'hourly',
      recurrenceLabel: 'Kas valandą',
      responsible: 'Slaugytoja',
      metadata: {
        general: true,
        patient: { reference: 'Jankauskas / B456' },
      },
    };

    notificationManager.updateNotifications([], [recurringTask], { suppressAlerts: true });

    const taskCard = document.querySelector('.notification-row[data-type="task"]');
    expect(taskCard).not.toBeNull();
    expect(taskCard.textContent).not.toContain('Kas valandą');

    const highlight = taskCard.querySelector('.notification-task__meta--highlight');
    expect(highlight).not.toBeNull();
    expect(highlight.textContent).toContain('Jankauskas / B456');
    expect(highlight.textContent).toContain('Stebėjimo zona');
  });

  it('grupuoja užduotis pagal prioritetą ir SLA', () => {
    const tasks = [
      {
        id: 'task-crit',
        title: 'Skubi laboratorija',
        priority: 1,
        dueAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        status: 'inProgress',
        zone: 'laboratory',
        channel: 'laboratory',
      },
      {
        id: 'task-medium',
        title: 'Komunikacijos užduotis',
        priority: 3,
        dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        status: 'planned',
        zone: 'communication',
        channel: 'communication',
      },
    ];

    notificationManager.updateNotifications([], tasks, { suppressAlerts: true });

    const items = [...document.querySelectorAll('.notification-task')];
    expect(items).toHaveLength(2);
    const overdue = items.find((item) => item.textContent.includes('Skubi laboratorija'));
    expect(overdue.textContent).toMatch(/Prieš/);

    const taskCards = document.querySelectorAll('.notification-row[data-type="task"]');
    expect(taskCards.length).toBe(0);
  });

  it('leidžia pažymėti užduotį atlikta tiesiai iš kortelės', () => {
    const task = {
      id: 'task-inline',
      title: 'Patikrinti defibriliatorių',
      priority: 2,
      status: 'inProgress',
      zone: 'general',
      channel: 'general',
      metadata: { general: true },
    };

    notificationManager.updateNotifications([], [task], { suppressAlerts: true });

    const button = document.querySelector('button[data-action="complete-task"]');
    expect(button).not.toBeNull();

    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    expect(completeSpy).toHaveBeenCalledWith('task-inline', '');
  });
});
