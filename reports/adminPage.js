import { ReportingService } from './reportingService.js';
import { getSupabaseClient } from '../persistence/supabaseClient.js';
import { UserInteractionLogger } from '../analytics/userInteractionLogger.js';
import { TASK_PRIORITIES, TASK_RECURRENCE_OPTIONS } from '../models/taskData.js';
import { t, texts } from '../texts.js';

const ALL_VALUE = 'viskas';
const SEARCH_DEBOUNCE = 200;
const TASK_PRIORITY_MIN = 0;
const TASK_PRIORITY_MAX = 5;

const auditState = {
  performer: ALL_VALUE,
  type: ALL_VALUE,
  bed: ALL_VALUE,
  search: '',
};

const elements = {
  loader: document.getElementById('loader'),
  status: document.getElementById('adminStatus'),
  content: document.getElementById('adminContent'),
  performerSelect: document.getElementById('filter-performer'),
  typeSelect: document.getElementById('filter-type'),
  bedSelect: document.getElementById('filter-bed'),
  searchInput: document.getElementById('filter-search'),
  statTotal: document.getElementById('stat-total'),
  statAverage: document.getElementById('stat-average'),
  actionStatsBody: document.getElementById('table-action-stats'),
  bedStatsBody: document.getElementById('table-bed-stats'),
  tableBody: document.getElementById('table-rows'),
  tableStatus: document.getElementById('table-status'),
  refreshAdminBtn: document.getElementById('refreshAdminBtn'),
  taskTable: document.getElementById('taskAdminTable'),
  taskStatus: document.getElementById('taskAdminStatus'),
  taskRefreshBtn: document.getElementById('refreshTasksBtn'),
};

let allRecords = [];
let tasks = [];
let taskCache = new Map();
let searchTimer = null;
let reportingService = null;
let taskService = null;
let logger = null;
let hasBootstrapped = false;
let loaderRequests = 0;
let currentUserEmail = null;

class TaskAdminService {
  constructor(client) {
    this.client = client;
  }

  setClient(client) {
    this.client = client;
  }

  async fetchTasks() {
    if (!this.client) {
      throw new Error('Supabase klientas neaktyvus.');
    }

    const { data, error } = await this.client
      .from('tasks')
      .select('id,title,description,priority,due_at,status,recurrence,recurrence_label,metadata,responsible,zone,zone_label,updated_at,created_at')
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data : [];
  }

  async updateTask(taskId, updates = {}, context = {}) {
    if (!this.client) {
      throw new Error('Supabase klientas neaktyvus.');
    }
    if (!taskId) {
      throw new Error('Užduoties identifikatorius nenurodytas.');
    }

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'priority')) {
      payload.priority = updates.priority;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'dueAt')) {
      payload.due_at = updates.dueAt;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'recurrence')) {
      payload.recurrence = updates.recurrence;
      payload.recurrence_label = updates.recurrenceLabel ?? updates.recurrence;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'metadata')) {
      payload.metadata = updates.metadata ?? null;
    }

    if (Object.keys(payload).length === 0) {
      return null;
    }

    const { data, error } = await this.client
      .from('tasks')
      .update(payload)
      .eq('id', taskId)
      .select('id,title,description,priority,due_at,status,recurrence,recurrence_label,metadata,responsible,zone,zone_label,updated_at,created_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    const updatedTask = data ?? null;

    try {
      await this.client.from('task_events').insert({
        task_id: taskId,
        change_type: context.changeType ?? 'admin_update',
        priority: Object.prototype.hasOwnProperty.call(updates, 'priority') ? updates.priority : null,
        due_at: Object.prototype.hasOwnProperty.call(updates, 'dueAt') ? updates.dueAt : null,
        recurrence: Object.prototype.hasOwnProperty.call(updates, 'recurrence') ? updates.recurrence : null,
        metadata: updates.metadata ? { recurringFrequencyMinutes: updates.metadata.recurringFrequencyMinutes ?? null } : null,
        notes: context.notes ?? null,
        changed_by: context.changedBy ?? null,
      });
    } catch (eventError) {
      console.warn('Nepavyko įrašyti užduoties įvykio:', eventError);
    }

    return updatedTask;
  }
}

function toggleLoader(visible) {
  if (!elements.loader) return;
  if (visible) {
    loaderRequests += 1;
  } else {
    loaderRequests = Math.max(0, loaderRequests - 1);
  }
  elements.loader.classList.toggle('hidden', loaderRequests === 0);
}

function showStatus(message, tone = 'info') {
  if (!elements.status) return;
  elements.status.textContent = message ?? '';
  if (!message) {
    elements.status.classList.add('hidden');
    elements.status.removeAttribute('data-tone');
    return;
  }
  elements.status.dataset.tone = tone;
  elements.status.classList.remove('hidden');
}

function showTaskStatus(message, tone = 'info') {
  if (!elements.taskStatus) return;
  elements.taskStatus.textContent = message ?? '';
  if (!message) {
    elements.taskStatus.classList.add('hidden');
    elements.taskStatus.removeAttribute('data-tone');
    return;
  }
  elements.taskStatus.dataset.tone = tone;
  elements.taskStatus.classList.remove('hidden');
}

function toggleContent(visible) {
  if (!elements.content) return;
  elements.content.classList.toggle('hidden', !visible);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateAverageGap(items) {
  const sorted = items
    .map((item) => parseDate(item.occurredAt))
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  if (sorted.length < 2) {
    return Number.NaN;
  }

  let total = 0;
  let count = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const diff = sorted[index] - sorted[index - 1];
    if (diff > 0) {
      total += diff;
      count += 1;
    }
  }

  if (!count) {
    return Number.NaN;
  }

  return total / count / 60000;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '–';
  }
  if (minutes < 1) {
    const seconds = Math.round(minutes * 60);
    return seconds <= 0 ? '<1 s' : `${seconds} s`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins ? `${hours} val ${mins} min` : `${hours} val`;
  }
  return `${minutes.toFixed(1)} min`;
}

function buildOptions(select, values, label) {
  if (!select) return;
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement('option');
  defaultOption.value = ALL_VALUE;
  defaultOption.textContent = label;
  fragment.append(defaultOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    fragment.append(option);
  });

  select.innerHTML = '';
  select.append(fragment);
  select.value = ALL_VALUE;
}

function uniqueValues(records, key) {
  const set = new Set();
  records.forEach((item) => {
    const value = item[key];
    if (!value) return;
    const trimmed = String(value).trim();
    if (trimmed) {
      set.add(trimmed);
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'lt', { sensitivity: 'base' }));
}

function applyAuditFilters() {
  const searchTerm = auditState.search.toLowerCase();
  return allRecords.filter((item) => {
    const matchesPerformer = auditState.performer === ALL_VALUE || item.performedBy === auditState.performer;
    const matchesType = auditState.type === ALL_VALUE || item.interactionType === auditState.type;
    const matchesBed = auditState.bed === ALL_VALUE || item.bedLabel === auditState.bed;

    if (!matchesPerformer || !matchesType || !matchesBed) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const haystack = [
      item.interactionType || '',
      item.bedLabel || '',
      item.performedBy || '',
      item.details || '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(searchTerm);
  });
}

function renderAuditTable(rows) {
  if (!elements.tableBody) return;
  elements.tableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-slate-50 dark:odd:bg-slate-800/40';

    const cells = [row.occurredAtText, row.interactionType, row.bedLabel, row.performedBy, row.details || ''];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.className = 'px-4 py-2 text-slate-700 dark:text-slate-200 align-top';
      td.textContent = value;
      tr.append(td);
    });

    fragment.append(tr);
  });

  elements.tableBody.append(fragment);
  if (elements.tableStatus) {
    elements.tableStatus.textContent = rows.length ? '' : 'Pagal pasirinktus filtrus įrašų nėra.';
  }
}

function renderAuditStats(rows) {
  if (elements.statTotal) {
    elements.statTotal.textContent = rows.length.toString();
  }
  if (elements.statAverage) {
    elements.statAverage.textContent = formatDuration(calculateAverageGap(rows));
  }

  const renderGrouped = (key, container) => {
    if (!container) return;
    container.innerHTML = '';
    const groups = new Map();
    rows.forEach((row) => {
      const groupKey = row[key] || 'Nežinoma';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(row);
    });

    const entries = Array.from(groups.entries())
      .map(([label, items]) => ({
        label,
        count: items.length,
        avg: calculateAverageGap(items),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'lt', { sensitivity: 'base' }));

    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const tr = document.createElement('tr');
      tr.className = 'odd:bg-slate-50 dark:odd:bg-slate-800/40';

      const labelCell = document.createElement('td');
      labelCell.className = 'px-4 py-2 text-slate-700 dark:text-slate-200';
      labelCell.textContent = entry.label;

      const countCell = document.createElement('td');
      countCell.className = 'px-4 py-2 text-slate-700 dark:text-slate-200';
      countCell.textContent = entry.count.toString();

      const avgCell = document.createElement('td');
      avgCell.className = 'px-4 py-2 text-slate-700 dark:text-slate-200';
      avgCell.textContent = formatDuration(entry.avg);

      tr.append(labelCell, countCell, avgCell);
      fragment.append(tr);
    });

    container.append(fragment);
  };

  renderGrouped('interactionType', elements.actionStatsBody);
  renderGrouped('bedLabel', elements.bedStatsBody);
}

function renderAuditSection() {
  const rows = applyAuditFilters();
  renderAuditTable(rows);
  renderAuditStats(rows);
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char] ?? char;
  });
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (input) => String(input).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getRecurrenceLabel(value) {
  const option = TASK_RECURRENCE_OPTIONS.find((item) => item.value === value);
  if (!option) return value;
  return t(texts.tasks?.recurrence?.[option.labelKey]) || value;
}

function formatTaskStatus(task) {
  const parts = [];
  if (task.zoneLabel || task.zone) {
    parts.push(`${t(texts.tasks?.labels?.zone) || 'Zona'}: ${task.zoneLabel || task.zone}`);
  }
  if (task.status) {
    const statusLabel = t(texts.tasks?.status?.[task.status]) || task.status;
    parts.push(`${t(texts.tasks?.statusFilterLabel) || 'Būsena'}: ${statusLabel}`);
  }
  if (task.responsible) {
    parts.push(`${t(texts.tasks?.labels?.responsible) || 'Atsakingas'}: ${task.responsible}`);
  }
  return parts.join(' · ');
}

function normaliseTask(task) {
  if (!task) return null;
  const metadata = typeof task.metadata === 'object' && task.metadata !== null ? task.metadata : {};
  return {
    id: task.id,
    title: task.title ?? t(texts.tasks?.title) ?? 'Užduotis',
    description: task.description ?? '',
    priority: Number.isFinite(task.priority) ? Number(task.priority) : TASK_PRIORITIES.MEDIUM,
    dueAt: task.due_at ?? task.dueAt ?? null,
    status: task.status ?? 'planned',
    recurrence: task.recurrence ?? 'none',
    recurrenceLabel: task.recurrence_label ?? task.recurrence ?? 'none',
    metadata,
    responsible: task.responsible ?? '',
    zone: task.zone ?? task.channel ?? '',
    zoneLabel: task.zone_label ?? task.zone ?? task.channel_label ?? '',
    updatedAt: task.updated_at ?? task.updatedAt ?? null,
    createdAt: task.created_at ?? task.createdAt ?? null,
  };
}

function getTaskRow(taskId) {
  if (!elements.taskTable) return null;
  return elements.taskTable.querySelector(`tr[data-task-id="${CSS.escape(taskId)}"]`);
}

function toggleFrequencyVisibility(row, recurrenceValue) {
  if (!row) return;
  const container = row.querySelector('[data-role="frequency-container"]');
  if (!container) return;
  const isRecurring = recurrenceValue !== 'none';
  container.classList.toggle('hidden', !isRecurring);
  const input = container.querySelector('[data-field="frequency"]');
  if (input) {
    input.required = isRecurring;
    if (!isRecurring) {
      input.value = '';
    }
  }
}

function createTaskRow(task) {
  const row = document.createElement('tr');
  row.dataset.taskId = task.id;
  row.className = 'odd:bg-slate-50 dark:odd:bg-slate-800/40 align-top';

  const infoCell = document.createElement('td');
  infoCell.className = 'px-4 py-3 text-sm text-slate-800 dark:text-slate-100 align-top';
  infoCell.innerHTML = `
    <div class="font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(task.title)}</div>
    <div class="text-sm text-slate-600 dark:text-slate-300 mt-1">${escapeHtml(task.description || '—')}</div>
    <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1">
      <div>${escapeHtml(formatTaskStatus(task))}</div>
      ${task.updatedAt ? `<div>${escapeHtml(t(texts.tasks?.labels?.updated) || 'Atnaujinta')}: ${escapeHtml(new Date(task.updatedAt).toLocaleString('lt-LT'))}</div>` : ''}
    </div>
  `;
  row.append(infoCell);

  const priorityCell = document.createElement('td');
  priorityCell.className = 'px-4 py-3 align-top';
  const priorityInput = document.createElement('input');
  priorityInput.type = 'number';
  priorityInput.min = String(TASK_PRIORITY_MIN);
  priorityInput.max = String(TASK_PRIORITY_MAX);
  priorityInput.step = '1';
  priorityInput.value = Number.isFinite(task.priority) ? String(task.priority) : '';
  priorityInput.dataset.field = 'priority';
  priorityInput.className = 'w-20 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500';
  priorityCell.append(priorityInput);
  row.append(priorityCell);

  const dueCell = document.createElement('td');
  dueCell.className = 'px-4 py-3 align-top';
  const dueInput = document.createElement('input');
  dueInput.type = 'datetime-local';
  dueInput.value = formatDateTimeLocal(task.dueAt);
  dueInput.dataset.field = 'dueAt';
  dueInput.className = 'w-44 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500';
  dueCell.append(dueInput);
  const clearDueBtn = document.createElement('button');
  clearDueBtn.type = 'button';
  clearDueBtn.dataset.action = 'clear-due';
  clearDueBtn.dataset.taskId = task.id;
  clearDueBtn.className = 'ml-2 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';
  clearDueBtn.textContent = t(texts.tasks?.labels?.clearDue) || 'Išvalyti';
  dueCell.append(clearDueBtn);
  row.append(dueCell);

  const recurrenceCell = document.createElement('td');
  recurrenceCell.className = 'px-4 py-3 align-top';
  const recurrenceSelect = document.createElement('select');
  recurrenceSelect.dataset.field = 'recurrence';
  recurrenceSelect.className = 'w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500';
  TASK_RECURRENCE_OPTIONS.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = t(texts.tasks?.recurrence?.[option.labelKey]) || option.value;
    if (option.value === (task.recurrence ?? 'none')) {
      opt.selected = true;
    }
    recurrenceSelect.append(opt);
  });
  recurrenceCell.append(recurrenceSelect);

  const frequencyContainer = document.createElement('div');
  frequencyContainer.dataset.role = 'frequency-container';
  frequencyContainer.className = 'mt-2';
  const frequencyInput = document.createElement('input');
  frequencyInput.type = 'number';
  frequencyInput.dataset.field = 'frequency';
  frequencyInput.min = '5';
  frequencyInput.step = '5';
  frequencyInput.value = Number.isFinite(task.metadata?.recurringFrequencyMinutes)
    ? String(task.metadata.recurringFrequencyMinutes)
    : '';
  frequencyInput.placeholder = t(texts.forms?.task?.frequencyPlaceholder) || 'Minutės';
  frequencyInput.className = 'w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500';
  frequencyContainer.append(frequencyInput);
  recurrenceCell.append(frequencyContainer);
  row.append(recurrenceCell);
  toggleFrequencyVisibility(row, recurrenceSelect.value);

  const actionsCell = document.createElement('td');
  actionsCell.className = 'px-4 py-3 align-top';
  const actionsWrapper = document.createElement('div');
  actionsWrapper.className = 'flex flex-wrap gap-2';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.dataset.action = 'save';
  saveBtn.dataset.taskId = task.id;
  saveBtn.className = 'px-3 py-1 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors';
  saveBtn.textContent = 'Išsaugoti';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.dataset.action = 'reset';
  resetBtn.dataset.taskId = task.id;
  resetBtn.className = 'px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors';
  resetBtn.textContent = t(texts.forms?.task?.cancelButton) || 'Atstatyti';

  actionsWrapper.append(saveBtn, resetBtn);
  actionsCell.append(actionsWrapper);
  row.append(actionsCell);

  return row;
}

function renderTasks() {
  if (!elements.taskTable) return;
  elements.taskTable.innerHTML = '';
  const fragment = document.createDocumentFragment();
  tasks.forEach((task) => {
    const row = createTaskRow(task);
    fragment.append(row);
  });
  elements.taskTable.append(fragment);
}

function resetTaskRow(taskId) {
  const original = taskCache.get(taskId);
  const row = getTaskRow(taskId);
  if (!original || !row) {
    return;
  }
  const normalised = normaliseTask(original);
  const priorityInput = row.querySelector('[data-field="priority"]');
  if (priorityInput) {
    priorityInput.value = Number.isFinite(normalised.priority) ? String(normalised.priority) : '';
  }
  const dueInput = row.querySelector('[data-field="dueAt"]');
  if (dueInput) {
    dueInput.value = formatDateTimeLocal(normalised.dueAt);
  }
  const recurrenceSelect = row.querySelector('[data-field="recurrence"]');
  if (recurrenceSelect) {
    recurrenceSelect.value = normalised.recurrence ?? 'none';
    toggleFrequencyVisibility(row, recurrenceSelect.value);
  }
  const frequencyInput = row.querySelector('[data-field="frequency"]');
  if (frequencyInput) {
    frequencyInput.value = Number.isFinite(normalised.metadata?.recurringFrequencyMinutes)
      ? String(normalised.metadata.recurringFrequencyMinutes)
      : '';
  }
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent ?? '';
    button.disabled = true;
    button.textContent = t(texts.forms?.loading) || 'Saugoma…';
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function normaliseIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function collectTaskUpdates(taskId) {
  const originalRaw = taskCache.get(taskId);
  const row = getTaskRow(taskId);
  if (!originalRaw || !row) {
    return { updates: {}, changed: false, errors: ['Užduoties duomenys nerasti.'] };
  }

  const original = normaliseTask(originalRaw);
  const updates = {};
  const errors = [];

  const priorityInput = row.querySelector('[data-field="priority"]');
  if (priorityInput) {
    const value = Number.parseInt(priorityInput.value, 10);
    if (Number.isNaN(value)) {
      errors.push('Nurodykite prioritetą (skaičių).');
    } else if (value < TASK_PRIORITY_MIN || value > TASK_PRIORITY_MAX) {
      errors.push(`Prioritetas turi būti tarp ${TASK_PRIORITY_MIN} ir ${TASK_PRIORITY_MAX}.`);
    } else if (value !== original.priority) {
      updates.priority = value;
    }
  }

  const dueInput = row.querySelector('[data-field="dueAt"]');
  if (dueInput) {
    const raw = dueInput.value;
    const dueIso = raw ? normaliseIso(raw) : null;
    const originalIso = original.dueAt ? normaliseIso(original.dueAt) : null;
    if (raw && !dueIso) {
      errors.push('Netinkamas termino formatas.');
    } else if (dueIso !== originalIso) {
      updates.dueAt = dueIso;
    }
  }

  const recurrenceSelect = row.querySelector('[data-field="recurrence"]');
  const frequencyInput = row.querySelector('[data-field="frequency"]');
  if (recurrenceSelect) {
    const value = recurrenceSelect.value ?? 'none';
    if (value !== (original.recurrence ?? 'none')) {
      updates.recurrence = value;
      updates.recurrenceLabel = getRecurrenceLabel(value);
    }

    if (value !== 'none') {
      const freqValue = frequencyInput ? Number.parseInt(frequencyInput.value, 10) : null;
      if (!Number.isFinite(freqValue) || freqValue <= 0) {
        errors.push('Pasikartojimo dažnis turi būti nurodytas minutėmis (>0).');
      } else if (freqValue !== original.metadata?.recurringFrequencyMinutes) {
        updates.metadata = {
          ...(original.metadata ?? {}),
          recurringFrequencyMinutes: freqValue,
        };
      }
    } else if (original.metadata?.recurringFrequencyMinutes) {
      updates.metadata = {
        ...(original.metadata ?? {}),
        recurringFrequencyMinutes: null,
      };
    }
  }

  const changed = Object.keys(updates).length > 0;
  return { updates, changed, errors };
}

async function getCurrentUserEmail() {
  if (currentUserEmail) {
    return currentUserEmail;
  }
  if (!taskService?.client?.auth?.getUser) {
    return null;
  }
  try {
    const { data } = await taskService.client.auth.getUser();
    currentUserEmail = data?.user?.email ?? null;
  } catch (error) {
    console.warn('Nepavyko gauti naudotojo el. pašto:', error);
    currentUserEmail = null;
  }
  return currentUserEmail;
}

async function handleTaskSave(taskId, button) {
  const { updates, changed, errors } = collectTaskUpdates(taskId);
  if (errors.length) {
    showTaskStatus(errors.join(' '), 'error');
    return;
  }
  if (!changed) {
    showTaskStatus('Pakeitimų nerasta.', 'info');
    return;
  }
  if (!taskService) {
    showTaskStatus('Užduočių paslauga nepasiekiama.', 'error');
    return;
  }

  setButtonLoading(button, true);
  toggleLoader(true);
  try {
    const email = await getCurrentUserEmail();
    const updated = await taskService.updateTask(taskId, updates, { changedBy: email });
    if (!updated) {
      showTaskStatus('Nepavyko atnaujinti užduoties.', 'error');
      return;
    }
    taskCache.set(taskId, updated);
    tasks = tasks.map((task) => (task.id === taskId ? normaliseTask(updated) : task));
    renderTasks();
    showTaskStatus('Užduotis atnaujinta sėkmingai.', 'success');
    if (logger) {
      void logger.logInteraction('admin_task_updated', {
        taskId,
        changedFields: Object.keys(updates),
      });
    }
  } catch (error) {
    console.error('Nepavyko išsaugoti užduoties:', error);
    showTaskStatus('Nepavyko išsaugoti užduoties. Patikrinkite ryšį ir bandykite dar kartą.', 'error');
  } finally {
    toggleLoader(false);
    setButtonLoading(button, false);
  }
}

function handleTaskReset(taskId) {
  resetTaskRow(taskId);
  showTaskStatus('Pakeitimai atkurti.', 'info');
}

function setupTaskTableListeners() {
  if (!elements.taskTable) return;

  elements.taskTable.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, taskId } = button.dataset;
    if (!taskId) return;

    if (action === 'save') {
      event.preventDefault();
      void handleTaskSave(taskId, button);
    } else if (action === 'reset') {
      event.preventDefault();
      handleTaskReset(taskId);
    } else if (action === 'clear-due') {
      event.preventDefault();
      const row = getTaskRow(taskId);
      const dueInput = row?.querySelector('[data-field="dueAt"]');
      if (dueInput) {
        dueInput.value = '';
      }
    }
  });

  elements.taskTable.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-field="recurrence"]');
    if (!select) return;
    const row = event.target.closest('tr[data-task-id]');
    toggleFrequencyVisibility(row, select.value);
  });
}

function normaliseRecords(raw) {
  return (raw ?? []).map((item) => {
    const occurredAt = item.occurredAt ?? null;
    const occurredDate = occurredAt ? new Date(occurredAt) : null;
    const occurredAtText = occurredDate && !Number.isNaN(occurredDate.getTime())
      ? occurredDate.toLocaleString('lt-LT')
      : '–';
    const bedLabel = item.payload?.bedLabel ?? item.payload?.bedId ?? item.bedId ?? '—';
    const performer = item.performedBy ?? 'Nežinomas naudotojas';
    const details = item.payload?.payload?.status ?? item.payload?.status ?? '';

    return {
      id: item.id ?? '',
      interactionType: item.interactionType ?? 'Nežinomas veiksmas',
      bedLabel,
      performedBy: performer,
      details,
      occurredAt,
      occurredAtText,
    };
  });
}

async function loadAuditData() {
  if (!reportingService) {
    showStatus('Ataskaitos paslauga nepasiekiama.', 'error');
    return;
  }

  toggleLoader(true);
  showStatus('Kraunama veiksmų žurnalo informacija...', 'info');

  try {
    const result = await reportingService.fetchInteractionAudit({ limit: 200 });
    if (result.source !== 'supabase') {
      showStatus('Nuotoliniai duomenys nepasiekiami. Patikrinkite ryšį ir prisijungimą.', 'error');
      toggleContent(false);
      return;
    }

    allRecords = normaliseRecords(result.data);
    buildOptions(elements.performerSelect, uniqueValues(allRecords, 'performedBy'), 'Visi atlikėjai');
    buildOptions(elements.typeSelect, uniqueValues(allRecords, 'interactionType'), 'Visi veiksmai');
    buildOptions(elements.bedSelect, uniqueValues(allRecords, 'bedLabel'), 'Visos lovos');

    auditState.performer = ALL_VALUE;
    auditState.type = ALL_VALUE;
    auditState.bed = ALL_VALUE;

    renderAuditSection();
    toggleContent(true);
    showStatus('Duomenys sėkmingai atnaujinti.', 'success');
    if (logger) {
      void logger.logInteraction('audit_log_page_loaded', { total: allRecords.length });
    }
  } catch (error) {
    console.error('Nepavyko įkelti veiksmų žurnalo:', error);
    showStatus('Nepavyko įkelti veiksmų žurnalo. Bandykite dar kartą.', 'error');
    toggleContent(false);
  } finally {
    toggleLoader(false);
  }
}

async function loadTasks() {
  if (!taskService) {
    showTaskStatus('Užduočių paslauga nepasiekiama.', 'error');
    return;
  }

  toggleLoader(true);
  showTaskStatus('Kraunamas užduočių sąrašas...', 'info');

  try {
    const rawTasks = await taskService.fetchTasks();
    taskCache = new Map();
    tasks = rawTasks.map((item) => {
      taskCache.set(item.id, item);
      return normaliseTask(item);
    });
    renderTasks();
    showTaskStatus(`Rasta ${tasks.length} užduočių.`, 'success');
  } catch (error) {
    console.error('Nepavyko įkelti užduočių sąrašo:', error);
    showTaskStatus('Nepavyko įkelti užduočių. Patikrinkite ryšį ir bandykite dar kartą.', 'error');
  } finally {
    toggleLoader(false);
  }
}

function setupEventListeners() {
  if (elements.performerSelect) {
    elements.performerSelect.addEventListener('change', (event) => {
      auditState.performer = event.target.value;
      renderAuditSection();
    });
  }
  if (elements.typeSelect) {
    elements.typeSelect.addEventListener('change', (event) => {
      auditState.type = event.target.value;
      renderAuditSection();
    });
  }
  if (elements.bedSelect) {
    elements.bedSelect.addEventListener('change', (event) => {
      auditState.bed = event.target.value;
      renderAuditSection();
    });
  }
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (event) => {
      const value = event.target.value || '';
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }
      searchTimer = window.setTimeout(() => {
        auditState.search = value.trim();
        renderAuditSection();
      }, SEARCH_DEBOUNCE);
    });
  }

  if (elements.refreshAdminBtn) {
    elements.refreshAdminBtn.addEventListener('click', () => {
      if (logger) {
        void logger.logInteraction('admin_tools_refresh');
      }
      void Promise.all([loadTasks(), loadAuditData()]);
    });
  }

  if (elements.taskRefreshBtn) {
    elements.taskRefreshBtn.addEventListener('click', () => {
      if (logger) {
        void logger.logInteraction('admin_tasks_refresh');
      }
      void loadTasks();
    });
  }

  setupTaskTableListeners();
}

function initialiseServices() {
  try {
    const client = getSupabaseClient(document);
    reportingService = new ReportingService({ client });
    taskService = new TaskAdminService(client);
    logger = new UserInteractionLogger({ document, client });
  } catch (error) {
    console.error('Nuotolinės paslaugos konfigūracija nerasta:', error);
    showStatus('Nuotolinės paslaugos konfigūracija nerasta. Patikrinkite puslapio data-* atributus.', 'error');
    toggleContent(false);
  }
}

export function initAdminPage() {
  if (hasBootstrapped) {
    return;
  }

  hasBootstrapped = true;
  setupEventListeners();
  initialiseServices();
  if (!reportingService || !taskService) {
    return;
  }
  void loadTasks();
  void loadAuditData();
}
