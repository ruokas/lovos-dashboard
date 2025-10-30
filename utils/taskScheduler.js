import { TASK_PRIORITIES, TASK_STATUSES } from '../models/taskData.js';

const DEFAULT_LOOKAHEAD_DAYS = 1;
const DEFAULT_GRACE_MINUTES = 60;
const DEFAULT_RETENTION_MINUTES = 240;
const SCHEDULER_SOURCE = 'scheduler';

export const DEFAULT_RECURRING_TEMPLATES = [
  {
    seriesId: 'lab-transport',
    title: 'Laboratoriniai mėginiai → Centrinė laboratorija',
    description: 'Paruošti ir perduoti mėginius į centrinę laboratoriją pagal grafiką.',
    channel: 'laboratory',
    channelLabel: 'Laboratorija',
    responsible: 'Laboratorijos kurjeris',
    priority: TASK_PRIORITIES.CRITICAL,
    startTimes: ['07:30', '10:30', '13:30', '16:30', '19:30', '22:30'],
    recurrence: 'daily',
    recurrenceLabel: 'Kasdien',
    type: 'logistics',
    typeLabel: 'Laboratoriniai pervežimai',
    metadata: { template: 'lab-default' },
  },
];

function resolveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normaliseStartTimes(startTimes = []) {
  return Array.isArray(startTimes)
    ? startTimes.filter((time) => typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time.trim()))
    : [];
}

export function generateOccurrences(template = {}, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const lookaheadDays = resolveNumber(template.lookaheadDays, DEFAULT_LOOKAHEAD_DAYS);
  const graceMinutes = resolveNumber(template.gracePeriodMinutes, DEFAULT_GRACE_MINUTES);
  const startTimes = normaliseStartTimes(template.startTimes);

  if (startTimes.length === 0) {
    return [];
  }

  const baseSeriesId = template.seriesId ?? template.id ?? 'recurring';
  const occurrences = [];

  for (let dayOffset = 0; dayOffset <= lookaheadDays; dayOffset += 1) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + dayOffset);

    for (const time of startTimes) {
      const [hourStr, minuteStr] = time.split(':');
      const hours = Number.parseInt(hourStr, 10);
      const minutes = Number.parseInt(minuteStr, 10);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        continue;
      }

      const dueAt = new Date(dayStart);
      dueAt.setHours(hours, minutes, 0, 0);

      const diffMinutes = (dueAt.getTime() - now.getTime()) / 60000;
      if (diffMinutes < -graceMinutes) {
        continue;
      }

      const id = `${baseSeriesId}-${dueAt.toISOString()}`;
      occurrences.push({
        id,
        seriesId: baseSeriesId,
        title: template.title ?? template.summary ?? 'Periodinė užduotis',
        description: template.description ?? '',
        channel: template.channel ?? 'laboratory',
        channelLabel: template.channelLabel ?? template.channel ?? 'Laboratorija',
        responsible: template.responsible ?? '',
        priority: template.priority ?? TASK_PRIORITIES.HIGH,
        dueAt: dueAt.toISOString(),
        type: template.type ?? 'logistics',
        typeLabel: template.typeLabel ?? template.title ?? 'Logistika',
        recurrence: template.recurrence ?? 'daily',
        recurrenceLabel: template.recurrenceLabel ?? template.recurrence ?? 'daily',
        status: TASK_STATUSES.PLANNED,
        source: SCHEDULER_SOURCE,
        metadata: {
          scheduler: baseSeriesId,
          ...template.metadata,
        },
      });
    }
  }

  return occurrences;
}

export function materializeRecurringTasks(options = {}) {
  const {
    taskManager,
    templates = DEFAULT_RECURRING_TEMPLATES,
    referenceDate = new Date(),
    lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
    retentionMinutes = DEFAULT_RETENTION_MINUTES,
  } = options;

  if (!taskManager || typeof taskManager.addTask !== 'function') {
    return [];
  }

  const normalizedTemplates = Array.isArray(templates) && templates.length > 0
    ? templates
    : DEFAULT_RECURRING_TEMPLATES;

  const occurrences = normalizedTemplates.flatMap((template) =>
    generateOccurrences({ ...template, lookaheadDays }, referenceDate),
  );

  const createdTasks = [];

  for (const occurrence of occurrences) {
    if (typeof taskManager.hasTask === 'function' && taskManager.hasTask(occurrence.id)) {
      taskManager.updateTask?.(occurrence.id, {
        priority: occurrence.priority,
        dueAt: occurrence.dueAt,
        responsible: occurrence.responsible,
        channel: occurrence.channel,
        channelLabel: occurrence.channelLabel,
      });
      continue;
    }

    const added = taskManager.addTask(occurrence);
    if (added) {
      createdTasks.push(added);
    }
  }

  if (typeof taskManager.getTasks === 'function' && typeof taskManager.removeTask === 'function') {
    const cutoff = new Date(referenceDate.getTime() - retentionMinutes * 60000);
    const allTasks = taskManager.getTasks();
    for (const task of allTasks) {
      if (task.source !== SCHEDULER_SOURCE || !task.dueAt) {
        continue;
      }
      const due = new Date(task.dueAt);
      if (!Number.isNaN(due.getTime()) && due < cutoff) {
        taskManager.removeTask(task.id);
      }
    }
  }

  return createdTasks;
}

export default {
  generateOccurrences,
  materializeRecurringTasks,
};
