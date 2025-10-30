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
    zone: 'laboratory',
    zoneLabel: 'Laboratorija',
    responsible: 'Laboratorijos kurjeris',
    priority: TASK_PRIORITIES.CRITICAL,
    startTimes: ['07:30', '10:30', '13:30', '16:30', '19:30', '22:30'],
    recurrence: 'daily',
    recurrenceLabel: 'Kasdien',
    frequencyMinutes: 30,
    frequencyLabel: 'Kas 30 min.',
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
  const baseSeriesId = template.seriesId ?? template.id ?? 'recurring';
  const startTimes = normaliseStartTimes(template.startTimes);
  const frequencyMinutes = resolveNumber(
    template.frequencyMinutes
      ?? template.metadata?.frequencyMinutes
      ?? template.metadata?.recurringFrequencyMinutes,
    null,
  );
  const startAtCandidate = template.startAt
    ?? template.metadata?.startAt
    ?? template.metadata?.recurringStartAt
    ?? template.dueAt
    ?? template.deadline
    ?? null;
  const startAt = startAtCandidate ? new Date(startAtCandidate) : null;

  const occurrences = [];

  const buildOccurrence = (dueAt) => ({
    id: `${baseSeriesId}-${dueAt.toISOString()}`,
    seriesId: baseSeriesId,
    title: template.title ?? template.summary ?? 'Periodinė užduotis',
    description: template.description ?? '',
    zone: template.zone ?? template.channel ?? 'laboratory',
    zoneLabel: template.zoneLabel ?? template.channelLabel ?? template.zone ?? template.channel ?? 'Laboratorija',
    channel: template.zone ?? template.channel ?? 'laboratory',
    channelLabel: template.zoneLabel ?? template.channelLabel ?? template.zone ?? template.channel ?? 'Laboratorija',
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
      frequencyMinutes,
      frequencyLabel: template.frequencyLabel
        ?? template.metadata?.frequencyLabel
        ?? template.metadata?.recurringFrequencyLabel
        ?? null,
      startAt: startAt ? startAt.toISOString() : null,
      recurringFrequencyMinutes: frequencyMinutes,
      recurringFrequencyLabel: template.frequencyLabel
        ?? template.metadata?.frequencyLabel
        ?? template.metadata?.recurringFrequencyLabel
        ?? null,
      ...(template.metadata ?? {}),
    },
  });

  if (startTimes.length > 0) {
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

        occurrences.push(buildOccurrence(dueAt));
      }
    }

    return occurrences;
  }

  if (!startAt || Number.isNaN(startAt.getTime())) {
    return occurrences;
  }

  const scheduleFrequency = Number.isFinite(frequencyMinutes) && frequencyMinutes > 0
    ? frequencyMinutes
    : null;
  const startAtMs = startAt.getTime();
  const lookaheadMs = lookaheadDays * 24 * 60 * 60000;
  const endAtMs = startAtMs + (scheduleFrequency ? lookaheadMs : 0);

  let current = new Date(startAt);
  while (current.getTime() <= (scheduleFrequency ? endAtMs : startAtMs)) {
    const diffMinutes = (current.getTime() - now.getTime()) / 60000;
    if (diffMinutes >= -graceMinutes) {
      occurrences.push(buildOccurrence(current));
    }

    if (!scheduleFrequency) {
      break;
    }

    current = new Date(current.getTime() + scheduleFrequency * 60000);
  }

  return occurrences;
}

export function materializeRecurringTasks(options = {}) {
  const {
    taskManager,
    templates = DEFAULT_RECURRING_TEMPLATES,
    referenceDate = new Date(),
    lookaheadDays,
    retentionMinutes = DEFAULT_RETENTION_MINUTES,
  } = options;

  if (!taskManager || typeof taskManager.addTask !== 'function') {
    return [];
  }

  const normalizedTemplates = Array.isArray(templates) && templates.length > 0
    ? templates
    : DEFAULT_RECURRING_TEMPLATES;

  const occurrences = normalizedTemplates.flatMap((template) => {
    const templateInput = Number.isFinite(lookaheadDays)
      ? { ...template, lookaheadDays }
      : template;
    return generateOccurrences(templateInput, referenceDate);
  });

  const createdTasks = [];

  for (const occurrence of occurrences) {
      if (typeof taskManager.hasTask === 'function' && taskManager.hasTask(occurrence.id)) {
      taskManager.updateTask?.(occurrence.id, {
        priority: occurrence.priority,
        dueAt: occurrence.dueAt,
        responsible: occurrence.responsible,
        zone: occurrence.zone,
        zoneLabel: occurrence.zoneLabel,
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
