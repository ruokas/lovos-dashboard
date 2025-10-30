/**
 * Modal form for creating operational tasks.
 * Užduočių tipų / kanalų sąrašą atnaujinkite `models/taskData.js` faile.
 */

import {
  TASK_CHANNEL_OPTIONS,
  TASK_RECURRENCE_OPTIONS,
  TASK_STATUSES,
  TASK_TYPE_OPTIONS,
} from '../models/taskData.js';
import { t, texts } from '../texts.js';

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

  if (optionGroup === TASK_TYPE_OPTIONS) {
    return t(texts.tasks?.types?.[option.labelKey]) || fallback || value;
  }
  if (optionGroup === TASK_RECURRENCE_OPTIONS) {
    return t(texts.tasks?.recurrence?.[option.labelKey]) || fallback || value;
  }
  if (optionGroup === TASK_CHANNEL_OPTIONS) {
    return t(texts.tasks?.channels?.[option.labelKey]) || fallback || value;
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

    if (this.modal?.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }

    this.modal = null;
    this.submitButton = null;
    this.feedbackElement = null;
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
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
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="taskType" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ${escapeHtml(t(texts.forms.task?.typeLabel))}
                </label>
                <select
                  id="taskType"
                  name="taskType"
                  required
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">${escapeHtml(t(texts.forms.task?.typePlaceholder))}</option>
                  ${TASK_TYPE_OPTIONS.map((option) => `
                    <option value="${escapeHtml(option.value)}">${escapeHtml(t(texts.tasks.types?.[option.labelKey]))}</option>
                  `).join('')}
                </select>
              </div>

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
                <label for="taskOwner" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ${escapeHtml(t(texts.forms.task?.ownerLabel))}
                </label>
                <input
                  type="text"
                  id="taskOwner"
                  name="taskOwner"
                  required
                  placeholder="${escapeHtml(t(texts.forms.task?.ownerPlaceholder))}"
                  class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>

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
            </div>

            <div>
              <label for="taskChannel" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                ${escapeHtml(t(texts.forms.task?.channelLabel))}
              </label>
              <select
                id="taskChannel"
                name="taskChannel"
                required
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">${escapeHtml(t(texts.forms.task?.channelPlaceholder))}</option>
                ${TASK_CHANNEL_OPTIONS.map((option) => `
                  <option value="${escapeHtml(option.value)}">${escapeHtml(t(texts.tasks.channels?.[option.labelKey]))}</option>
                `).join('')}
              </select>
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
    const responsible = formData.get('taskOwner')?.trim();
    const type = formData.get('taskType');
    const channel = formData.get('taskChannel');

    if (!description || !responsible || !type || !channel) {
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
          taskType: payload.type,
          channel: payload.channel,
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
    const typeValue = formData.get('taskType');
    const recurrenceValue = formData.get('taskRecurrence') || 'none';
    const channelValue = formData.get('taskChannel');
    const deadlineValue = formData.get('taskDeadline');

    let normalizedDeadline = null;
    if (deadlineValue) {
      const parsed = new Date(deadlineValue);
      if (!Number.isNaN(parsed.getTime())) {
        normalizedDeadline = parsed.toISOString();
      }
    }

    return {
      type: typeValue,
      typeLabel: resolveOptionLabel(TASK_TYPE_OPTIONS, typeValue, typeValue),
      description: formData.get('taskDescription')?.trim() ?? '',
      recurrence: recurrenceValue,
      recurrenceLabel: resolveOptionLabel(TASK_RECURRENCE_OPTIONS, recurrenceValue, recurrenceValue),
      responsible: formData.get('taskOwner')?.trim() ?? '',
      deadline: normalizedDeadline,
      channel: channelValue,
      channelLabel: resolveOptionLabel(TASK_CHANNEL_OPTIONS, channelValue, channelValue),
      status: TASK_STATUSES.PLANNED,
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
