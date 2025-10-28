import { ReportingService } from './reportingService.js';
import { getSupabaseClient } from '../persistence/supabaseClient.js';
import { UserInteractionLogger } from '../analytics/userInteractionLogger.js';

const ALL_VALUE = 'viskas';
const SEARCH_DEBOUNCE = 200;

const state = {
  performer: ALL_VALUE,
  type: ALL_VALUE,
  bed: ALL_VALUE,
  search: '',
};

const elements = {
  loader: document.getElementById('loader'),
  status: document.getElementById('auditStatus'),
  content: document.getElementById('auditContent'),
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
  refreshBtn: document.getElementById('refreshAuditBtn'),
};

let allRecords = [];
let searchTimer = null;
let reportingService = null;
let logger = null;
let hasBootstrapped = false;

function toggleLoader(visible) {
  if (!elements.loader) return;
  elements.loader.classList.toggle('hidden', !visible);
}

function showStatus(message, tone = 'info') {
  if (!elements.status) return;
  elements.status.textContent = message;
  if (!message) {
    elements.status.classList.add('hidden');
    elements.status.removeAttribute('data-tone');
    return;
  }
  elements.status.dataset.tone = tone;
  elements.status.classList.remove('hidden');
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

function applyFilters() {
  const searchTerm = state.search.toLowerCase();
  return allRecords.filter((item) => {
    const matchesPerformer = state.performer === ALL_VALUE || item.performedBy === state.performer;
    const matchesType = state.type === ALL_VALUE || item.interactionType === state.type;
    const matchesBed = state.bed === ALL_VALUE || item.bedLabel === state.bed;

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

function renderTable(rows) {
  if (!elements.tableBody) return;
  elements.tableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-slate-50 dark:odd:bg-slate-800/40';

    const cells = [row.occurredAtText, row.interactionType, row.bedLabel, row.performedBy, row.details || '' ];
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

function renderStats(rows) {
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

function render() {
  const rows = applyFilters();
  renderTable(rows);
  renderStats(rows);
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

    state.performer = ALL_VALUE;
    state.type = ALL_VALUE;
    state.bed = ALL_VALUE;

    render();
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

function setupEventListeners() {
  if (elements.performerSelect) {
    elements.performerSelect.addEventListener('change', (event) => {
      state.performer = event.target.value;
      render();
    });
  }
  if (elements.typeSelect) {
    elements.typeSelect.addEventListener('change', (event) => {
      state.type = event.target.value;
      render();
    });
  }
  if (elements.bedSelect) {
    elements.bedSelect.addEventListener('change', (event) => {
      state.bed = event.target.value;
      render();
    });
  }
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (event) => {
      const value = event.target.value || '';
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }
      searchTimer = window.setTimeout(() => {
        state.search = value.trim();
        render();
      }, SEARCH_DEBOUNCE);
    });
  }
  if (elements.refreshBtn) {
    elements.refreshBtn.addEventListener('click', () => {
      if (logger) {
        void logger.logInteraction('audit_log_page_refresh');
      }
      void loadAuditData();
    });
  }
}

function initialiseServices() {
  try {
    const client = getSupabaseClient(document);
    reportingService = new ReportingService({ client });
    logger = new UserInteractionLogger({ document, client });
  } catch (error) {
    console.error('Nuotolinės paslaugos konfigūracija nerasta:', error);
    showStatus('Nuotolinės paslaugos konfigūracija nerasta. Patikrinkite puslapio data-* atributus.', 'error');
    toggleContent(false);
  }
}

export function initAuditPage() {
  if (hasBootstrapped) {
    return;
  }

  hasBootstrapped = true;
  setupEventListeners();
  initialiseServices();
  if (!reportingService) {
    return;
  }
  void loadAuditData();
}
