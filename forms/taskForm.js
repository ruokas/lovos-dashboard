/**
 * Modal form for creating operational tasks.
 * Užduočių tipų / kanalų sąrašą atnaujinkite `models/taskData.js` faile.
 */

import {
  TASK_RECURRENCE_OPTIONS,
  TASK_STATUSES,
  TASK_ZONE_OPTIONS,
} from '../models/taskData.js';
import { t, texts } from '../texts.js';

const RECURRENCE_DEFAULT_MINUTES = {
  perShift: 480,
  daily: 1440,
  weekly: 10080,
};

function formatDateTimeLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

function resolveOptionLabel(optionGroup, value, fallback) {
  const option = optionGroup.find((item) => item.value === value);
  if (!option) {
    return fallback ?? value ?? '';
  }

  if (optionGroup === TASK_RECURRENCE_OPTIONS) {
    return t(texts.tasks?.recurrence?.[option.labelKey]) || fallback || value;
  }
  if (optionGroup === TASK_ZONE_OPTIONS) {
    return t(texts.tasks?.zones?.[option.labelKey]) || fallback || value;
  }

  return fallback ?? value ?? '';
}

export class TaskForm {
  constructor(onSubmit, options = {}) {
    this.onSubmit = onSubmit;
    this.logger = options.logger ?? null;
    this.modal = null;
    this.isOpen = false;
    this.submitButton = null;
    this.feedbackElement = null;
    this.boundHandleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.hide();
      }
    };
  }

  show(options = {}) {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.createModal();
    document.body.appendChild(this.modal);
    document.body.classList.add('overflow-hidden');

    document.addEventListener('keydown', this.boundHandleEscape);

    if (this.logger?.logInteraction) {
      void this.logger.logInteraction('task_form_opened', {
        trigger: options.trigger ?? 'ui',
      });
    }

    // Focus first focusable field
    setTimeout(() => {
      const firstInput = this.modal.querySelector('select, input, textarea');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }

  hide() {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    document.removeEventListener('keydown', this.boundHandleEscape);
    document.body.classList.remove('overflow-hidden');

    if (this.modal?.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }

    this.modal = null;
    this.submitButton = null;
    this.feedbackElement = null;
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full" role="document">
        <div class="p-6 space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(t(texts.forms.task?.title))}</h2>
            <button
              type="button"
              id="closeTaskForm"
              class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="${escapeHtml(t(texts.forms.task?.closeLabel) || 'Uždaryti formą')}"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <p class="text-sm text-slate-600 dark:text-slate-300">${escapeHtml(t(texts.forms.task?.description))}</p>

          <div id="taskFormFeedback" class="hidden text-sm"></div>

          <form id="taskForm" class="space-y-4">
            <div>
              <label for="taskPatientReference" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                ${escapeHtml(t(texts.forms.task?.patientReferenceLabel))}
              </label>
              <input
                type="text"
                id="taskPatientReference"
                name="taskPatientReference"
                required
                autocomplete="off"
                placeholder="${escapeHtml(t(texts.forms.task?.patientReferencePlaceholder))}"
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="taskRecurrence" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ${escapeHtml(t(texts.forms.task?.recurrenceLabel))}
                </label>
                <select
                  id="taskRecurrence"
                  name="taskRecurrence"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  ${TASK_RECURRENCE_OPTIONS.map((option) => `
                    <option value="${escapeHtml(option.value)}"${option.value === 'none' ? ' selected' : ''}>${escapeHtml(t(texts.tasks.recurrence?.[option.labelKey]))}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div id="recurringDetails" class="hidden rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
              <div>
                <label for="taskFrequencyMinutes" class="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  ${escapeHtml(t(texts.forms.task?.frequencyLabel))}
                </label>
                <input
                  type="number"
                  inputmode="numeric"
                  min="5"
                  step="5"
                  id="taskFrequencyMinutes"
                  name="taskFrequencyMinutes"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="${escapeHtml(t(texts.forms.task?.frequencyPlaceholder))}"
                >
                <p class="text-xs text-slate-500 dark:text-slate-300 mt-1">${escapeHtml(t(texts.forms.task?.frequencyHelp))}</p>
              </div>
            </div>

            <div>
              <label for="taskDescription" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                ${escapeHtml(t(texts.forms.task?.descriptionLabel))}
              </label>
              <textarea
                id="taskDescription"
                name="taskDescription"
                rows="3"
                required
                placeholder="${escapeHtml(t(texts.forms.task?.descriptionPlaceholder))}"
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              ></textarea>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="taskDeadline" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ${escapeHtml(t(texts.forms.task?.deadlineLabel))}
                </label>
                <input
                  type="datetime-local"
                  id="taskDeadline"
                  name="taskDeadline"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>

              <div>
                <label for="taskZone" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ${escapeHtml(t(texts.forms.task?.zoneLabel))}
                </label>
                <select
                  id="taskZone"
                  name="taskZone"
                  required
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">${escapeHtml(t(texts.forms.task?.zonePlaceholder))}</option>
                  ${TASK_ZONE_OPTIONS.map((option) => `
                    <option value="${escapeHtml(option.value)}">${escapeHtml(t(texts.tasks.zones?.[option.labelKey]))}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                id="cancelTaskForm"
              class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
            >
                ${escapeHtml(t(texts.forms.task?.cancelButton) || 'Atšaukti')}
              </button>
              <button
                type="submit"
                id="taskFormSubmit"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                ${escapeHtml(t(texts.forms.task?.submitButton) || 'Sukurti')}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.submitButton = this.modal.querySelector('#taskFormSubmit');
    this.feedbackElement = this.modal.querySelector('#taskFormFeedback');
    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = this.modal.querySelector('#taskForm');
    const closeBtn = this.modal.querySelector('#closeTaskForm');
    const cancelBtn = this.modal.querySelector('#cancelTaskForm');
    const recurrenceSelect = this.modal.querySelector('#taskRecurrence');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hide());
    }
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void this.handleSubmit(form);
      });
    }

    if (recurrenceSelect) {
      const frequencyContainer = this.modal.querySelector('#recurringDetails');
      const frequencyInput = this.modal.querySelector('#taskFrequencyMinutes');
      const deadlineInput = this.modal.querySelector('#taskDeadline');

      const applyRecurrenceState = () => {
        const value = recurrenceSelect.value ?? 'none';
        const isRecurring = value !== 'none';
        if (frequencyContainer) {
          frequencyContainer.classList.toggle('hidden', !isRecurring);
        }
        if (deadlineInput) {
          deadlineInput.required = isRecurring;
        }

        if (isRecurring && frequencyInput) {
          const current = Number.parseInt(frequencyInput.value, 10);
          if (!Number.isFinite(current) || current <= 0) {
            const suggested = RECURRENCE_DEFAULT_MINUTES[value] ?? RECURRENCE_DEFAULT_MINUTES.daily;
            if (Number.isFinite(suggested)) {
              frequencyInput.value = String(suggested);
            }
          }
        } else if (!isRecurring && frequencyInput) {
          frequencyInput.value = '';
        }
      };

      recurrenceSelect.addEventListener('change', applyRecurrenceState);
      applyRecurrenceState();
    }

    const deadlineField = this.modal.querySelector('#taskDeadline');
    if (deadlineField && !deadlineField.value) {
      deadlineField.value = formatDateTimeLocal(new Date());
    }

    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) {
        this.hide();
      }
    });
  }

  async handleSubmit(form) {
    if (!form.checkValidity()) {
      this.setFeedback(t(texts.forms.validationError), 'error');
      return;
    }

    const formData = new FormData(form);
    const description = formData.get('taskDescription')?.trim();
    const patientReference = formData.get('taskPatientReference')?.trim();
    const zone = formData.get('taskZone');

    if (!description || !patientReference || !zone) {
      this.setFeedback(t(texts.forms.validationError), 'error');
      return;
    }

    const payload = this.buildPayload(formData);

    this.setSubmitting(true);

    try {
      const result = this.onSubmit ? await this.onSubmit(payload) : null;
      if (result === false) {
        throw new Error('Task submission rejected');
      }

      this.setFeedback(t(texts.forms.task?.submitSuccess ?? texts.forms.submitSuccess), 'success');

      if (this.logger?.logInteraction) {
        void this.logger.logInteraction('task_form_submitted', {
          zone: payload.zone,
          recurrence: payload.recurrence,
        });
      }

      setTimeout(() => this.hide(), 300);
      form.reset();
    } catch (error) {
      console.error('Nepavyko sukurti užduoties:', error);
      this.setFeedback(t(texts.forms.submitError), 'error');
    } finally {
      this.setSubmitting(false);
    }
  }

  buildPayload(formData) {
    const recurrenceValue = formData.get('taskRecurrence') || 'none';
    const zoneValue = formData.get('taskZone');
    const deadlineValue = formData.get('taskDeadline');
    const frequencyValue = formData.get('taskFrequencyMinutes');
    const patientReferenceValue = formData.get('taskPatientReference')?.trim() ?? '';

    let normalizedDeadline = null;
    if (deadlineValue) {
      const parsed = new Date(deadlineValue);
      if (!Number.isNaN(parsed.getTime())) {
        normalizedDeadline = parsed.toISOString();
      }
    }

    let frequencyMinutes = Number.parseInt(frequencyValue, 10);
    if (!Number.isFinite(frequencyMinutes) || frequencyMinutes <= 0) {
      frequencyMinutes = RECURRENCE_DEFAULT_MINUTES[recurrenceValue] ?? null;
    }

    const metadata = {
      patient: {
        reference: patientReferenceValue,
      },
    };
    if (Number.isFinite(frequencyMinutes) && frequencyMinutes > 0 && recurrenceValue !== 'none') {
      metadata.recurringFrequencyMinutes = frequencyMinutes;
    }

    return {
      description: formData.get('taskDescription')?.trim() ?? '',
      recurrence: recurrenceValue,
      recurrenceLabel: resolveOptionLabel(TASK_RECURRENCE_OPTIONS, recurrenceValue, recurrenceValue),
      deadline: normalizedDeadline,
      zone: zoneValue,
      zoneLabel: resolveOptionLabel(TASK_ZONE_OPTIONS, zoneValue, zoneValue),
      channel: zoneValue,
      channelLabel: resolveOptionLabel(TASK_ZONE_OPTIONS, zoneValue, zoneValue),
      status: TASK_STATUSES.PLANNED,
      metadata,
    };
  }

  setSubmitting(isSubmitting) {
    if (!this.submitButton) {
      return;
    }

    this.submitButton.disabled = isSubmitting;
    if (isSubmitting) {
      this.submitButton.dataset.originalText = this.submitButton.textContent;
      this.submitButton.textContent = t(texts.forms.submitInProgress);
    } else if (this.submitButton.dataset.originalText) {
      this.submitButton.textContent = this.submitButton.dataset.originalText;
      delete this.submitButton.dataset.originalText;
    }
  }

  setFeedback(message, variant = 'info') {
    if (!this.feedbackElement) {
      return;
    }

    const variantClasses = {
      success: 'text-emerald-600 dark:text-emerald-300',
      error: 'text-red-600 dark:text-red-300',
      info: 'text-slate-600 dark:text-slate-300',
    };

    this.feedbackElement.className = `text-sm ${variantClasses[variant] ?? variantClasses.info}`;
    this.feedbackElement.textContent = message ?? '';
    this.feedbackElement.classList.toggle('hidden', !message);
  }
}

export default TaskForm;
