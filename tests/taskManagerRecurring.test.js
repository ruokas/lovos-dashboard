import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TaskManager, TASK_PRIORITIES, TASK_STATUSES, mergeRecurringTasksForDisplay } from '../models/taskData.js';
import { materializeRecurringTasks } from '../utils/taskScheduler.js';

const createIso = (date) => date.toISOString();

describe('Pasikartojančių užduočių sujungimas', () => {
  beforeEach(() => {
    global.localStorage = {
      _store: new Map(),
      getItem(key) {
        return this._store.has(key) ? this._store.get(key) : null;
      },
      setItem(key, value) {
        this._store.set(key, String(value));
      },
      removeItem(key) {
        this._store.delete(key);
      },
    };
  });

  afterEach(() => {
    delete global.localStorage;
  });

  it('sugeneruoja vieną suvestinę su dažniu ir artimiausiu terminu', () => {
    const reference = new Date('2024-03-10T07:00:00Z');
    const firstDue = new Date(reference.getTime() + 5 * 60 * 1000);
    const secondDue = new Date(reference.getTime() + 35 * 60 * 1000);

    const occurrences = [
      {
        id: 'lab-1',
        seriesId: 'lab-transport',
        source: 'scheduler',
        title: 'Laboratoriniai mėginiai',
        description: 'Išsiųsti laboratorijos mėginius.',
        zone: 'laboratory',
        zoneLabel: 'Laboratorija',
        channel: 'laboratory',
        channelLabel: 'Laboratorija',
        responsible: 'Kurjeris',
        priority: TASK_PRIORITIES.CRITICAL,
        status: TASK_STATUSES.PLANNED,
        dueAt: createIso(firstDue),
        recurrence: 'daily',
        recurrenceLabel: 'Kasdien',
        metadata: { frequencyMinutes: 30, frequencyLabel: 'Kas 30 min.' },
        createdAt: createIso(reference),
        updatedAt: createIso(reference),
      },
      {
        id: 'lab-2',
        seriesId: 'lab-transport',
        source: 'scheduler',
        title: 'Laboratoriniai mėginiai',
        description: 'Išsiųsti laboratorijos mėginius.',
        zone: 'laboratory',
        zoneLabel: 'Laboratorija',
        channel: 'laboratory',
        channelLabel: 'Laboratorija',
        responsible: 'Kurjeris',
        priority: TASK_PRIORITIES.CRITICAL,
        status: TASK_STATUSES.PLANNED,
        dueAt: createIso(secondDue),
        recurrence: 'daily',
        recurrenceLabel: 'Kasdien',
        metadata: { frequencyMinutes: 30, frequencyLabel: 'Kas 30 min.' },
        createdAt: createIso(reference),
        updatedAt: createIso(reference),
      },
    ];

    const merged = mergeRecurringTasksForDisplay(occurrences, { referenceDate: reference });
    expect(merged).toHaveLength(1);
    const summary = merged[0];
    expect(summary.id).toBe('lab-transport');
    expect(summary.dueAt).toBe(createIso(firstDue));
    expect(summary.metadata.recurringOccurrencesCount).toBe(2);
    expect(summary.metadata.recurringSourceTaskIds).toEqual(['lab-1', 'lab-2']);
    expect(summary.recurrenceLabel).toBe('Kas 30 min.');
  });

  it('TaskManager.filterTasks grąžina tik vieną laboratorijos įrašą', () => {
    const manager = new TaskManager({ storageKey: 'test.tasks' });
    const now = new Date('2024-03-10T07:00:00Z');

    manager.tasks = [
      {
        id: 'lab-1',
        seriesId: 'lab-transport',
        source: 'scheduler',
        title: 'Laboratoriniai mėginiai',
        description: 'Išsiųsti laboratorijos mėginius.',
        zone: 'laboratory',
        zoneLabel: 'Laboratorija',
        channel: 'laboratory',
        channelLabel: 'Laboratorija',
        responsible: 'Kurjeris',
        priority: TASK_PRIORITIES.CRITICAL,
        status: TASK_STATUSES.PLANNED,
        dueAt: createIso(new Date(now.getTime() + 10 * 60 * 1000)),
        recurrence: 'daily',
        recurrenceLabel: 'Kasdien',
        metadata: { frequencyMinutes: 30, frequencyLabel: 'Kas 30 min.' },
        createdAt: createIso(now),
        updatedAt: createIso(now),
      },
      {
        id: 'lab-2',
        seriesId: 'lab-transport',
        source: 'scheduler',
        title: 'Laboratoriniai mėginiai',
        description: 'Išsiųsti laboratorijos mėginius.',
        zone: 'laboratory',
        zoneLabel: 'Laboratorija',
        channel: 'laboratory',
        channelLabel: 'Laboratorija',
        responsible: 'Kurjeris',
        priority: TASK_PRIORITIES.CRITICAL,
        status: TASK_STATUSES.PLANNED,
        dueAt: createIso(new Date(now.getTime() + 40 * 60 * 1000)),
        recurrence: 'daily',
        recurrenceLabel: 'Kasdien',
        metadata: { frequencyMinutes: 30, frequencyLabel: 'Kas 30 min.' },
        createdAt: createIso(now),
        updatedAt: createIso(now),
      },
      {
        id: 'other-1',
        seriesId: null,
        source: 'local',
        title: 'Patikra',
        description: 'Patikrinti įrangą.',
        zone: 'wards',
        zoneLabel: 'Skyrius',
        channel: 'wards',
        channelLabel: 'Skyrius',
        responsible: 'Slaugytoja',
        priority: TASK_PRIORITIES.MEDIUM,
        status: TASK_STATUSES.PLANNED,
        dueAt: createIso(new Date(now.getTime() + 60 * 60 * 1000)),
        recurrence: 'none',
        recurrenceLabel: 'Nepasikartojanti',
        metadata: {},
        createdAt: createIso(now),
        updatedAt: createIso(now),
      },
    ];

    const result = manager.filterTasks({ search: '', status: 'all', zone: 'all' });
    expect(result.some((task) => task.id === 'lab-1' || task.id === 'lab-2')).toBe(false);
    const mergedEntry = result.find((task) => task.id === 'lab-transport');
    expect(mergedEntry).toBeTruthy();
    expect(mergedEntry.recurrenceLabel).toBe('Kas 30 min.');
    expect(result).toHaveLength(2);
  });

  it('leidžia registruoti naudotojo pasikartojančią užduotį ir sugeneruoja artimiausias atsiradimų datas', () => {
    const manager = new TaskManager({ storageKey: 'test.tasks', templateStorageKey: 'test.templates' });
    const reference = new Date('2024-03-10T07:00:00Z');

    const created = manager.addTask({
      type: 'logistics',
      typeLabel: 'Logistika',
      description: 'Kas 2 val. perduoti mėginius.',
      recurrence: 'daily',
      recurrenceLabel: 'Kasdien',
      responsible: 'Kurjeris',
      zone: 'laboratory',
      zoneLabel: 'Laboratorija',
      channel: 'laboratory',
      channelLabel: 'Laboratorija',
      deadline: new Date(reference.getTime() + 60 * 60 * 1000).toISOString(),
      metadata: { recurringFrequencyMinutes: 120 },
      status: TASK_STATUSES.PLANNED,
      priority: TASK_PRIORITIES.HIGH,
    });

    const template = manager.registerRecurringTemplate(created, {
      frequencyMinutes: 120,
      startAt: created.deadline,
    });

    expect(template).toBeTruthy();
    expect(template.seriesId).toBeTruthy();

    manager.removeTask(created.id);

    materializeRecurringTasks({
      taskManager: manager,
      templates: manager.getRecurringTemplates(),
      referenceDate: reference,
      lookaheadDays: 1,
    });

    const occurrences = manager.getTasks().filter((task) => task.seriesId === template.seriesId);
    expect(occurrences.length).toBeGreaterThan(0);
    const next = occurrences[0];
    expect(next.metadata.recurringFrequencyMinutes).toBe(120);
    expect(new Date(next.dueAt).getTime()).toBeGreaterThanOrEqual(reference.getTime());
  });
});
