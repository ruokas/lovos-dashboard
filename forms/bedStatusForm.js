/**
 * Form interface for bed status reporting
 */

import { STATUS_OPTIONS, BED_LAYOUT } from '../models/bedData.js';

export class BedStatusForm {
  constructor(onSubmit) {
    this.onSubmit = onSubmit;
    this.isOpen = false;
    this.modal = null;
  }

  /**
   * Show the form modal
   */
  show(bedId = null) {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.createModal(bedId);
    document.body.appendChild(this.modal);
    
    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector('input, select');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  /**
   * Hide the form modal
   */
  hide() {
    if (!this.isOpen || !this.modal) return;
    
    this.isOpen = false;
    document.body.removeChild(this.modal);
    this.modal = null;
  }

  /**
   * Create the form modal HTML
   */
  createModal(preselectedBedId = null) {
    this.modal = document.createElement('div');
    this.modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    this.modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Pranešti apie lovos būklę</h2>
            <button id="closeForm" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <form id="bedStatusForm" class="space-y-4">
            <!-- Email -->
            <div>
              <label for="email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                El. paštas *
              </label>
              <input 
                type="email" 
                id="email" 
                name="email"
                required
                placeholder="vardas@example.com"
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
            </div>
            
            <!-- Bed Selection -->
            <div>
              <label for="bedId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Lova *
              </label>
              <select 
                id="bedId" 
                name="bedId"
                required
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pasirinkite lovą</option>
                ${BED_LAYOUT.map(bedId => 
                  `<option value="${bedId}" ${bedId === preselectedBedId ? 'selected' : ''}>${bedId}</option>`
                ).join('')}
              </select>
            </div>
            
            <!-- Status -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Būsena *
              </label>
              <div class="space-y-2">
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="${STATUS_OPTIONS.CLEAN}"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.CLEAN}</span>
                </label>
                
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="${STATUS_OPTIONS.MESSY_BED}"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.MESSY_BED}</span>
                </label>
                
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="${STATUS_OPTIONS.MISSING_EQUIPMENT}"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.MISSING_EQUIPMENT}</span>
                </label>
                
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="${STATUS_OPTIONS.OTHER}"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.OTHER}</span>
                </label>
              </div>
            </div>
            
            <!-- Other Description -->
            <div id="otherDescription" class="hidden">
              <label for="description" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Aprašymas *
              </label>
              <textarea 
                id="description" 
                name="description"
                rows="3"
                placeholder="Aprašykite problemą..."
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              ></textarea>
            </div>
            
            <!-- Actions -->
            <div class="flex justify-end space-x-3 pt-4">
              <button 
                type="button" 
                id="cancelForm"
                class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
              >
                Atšaukti
              </button>
              <button 
                type="submit"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Pranešti
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to the form
   */
  attachEventListeners() {
    // Close button
    this.modal.querySelector('#closeForm').addEventListener('click', () => {
      this.hide();
    });

    // Cancel button
    this.modal.querySelector('#cancelForm').addEventListener('click', () => {
      this.hide();
    });

    // Status change handler
    const statusInputs = this.modal.querySelectorAll('input[name="status"]');
    statusInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.handleStatusChange(input.value);
      });
    });

    // Form submission
    this.modal.querySelector('#bedStatusForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Handle status selection change
   */
  handleStatusChange(status) {
    const otherDescription = this.modal.querySelector('#otherDescription');
    const descriptionInput = this.modal.querySelector('#description');
    
    if (status === STATUS_OPTIONS.OTHER) {
      otherDescription.classList.remove('hidden');
      descriptionInput.required = true;
    } else {
      otherDescription.classList.add('hidden');
      descriptionInput.required = false;
      descriptionInput.value = '';
    }
  }

  /**
   * Handle form submission
   */
  handleSubmit() {
    const formData = new FormData(this.modal.querySelector('#bedStatusForm'));
    
    const formResponse = {
      timestamp: new Date().toISOString(),
      email: formData.get('email'),
      bedId: formData.get('bedId'),
      status: formData.get('status'),
      description: formData.get('description') || null
    };

    // Validate required fields
    if (!formResponse.email || !formResponse.bedId || !formResponse.status) {
      alert('Prašome užpildyti visus privalomus laukus.');
      return;
    }

    // Validate "Other" status requires description
    if (formResponse.status === STATUS_OPTIONS.OTHER && !formResponse.description) {
      alert('Prašome aprašyti problemą.');
      return;
    }

    // Submit the form
    if (this.onSubmit) {
      this.onSubmit(formResponse);
    }

    this.hide();
  }
}

/**
 * Occupancy form for tracking bed occupancy changes
 */
export class OccupancyForm {
  constructor(onSubmit) {
    this.onSubmit = onSubmit;
    this.isOpen = false;
    this.modal = null;
  }

  /**
   * Show the occupancy form modal
   */
  show(bedId = null) {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.createModal(bedId);
    document.body.appendChild(this.modal);
    
    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector('input, select');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  /**
   * Hide the occupancy form modal
   */
  hide() {
    if (!this.isOpen || !this.modal) return;
    
    this.isOpen = false;
    document.body.removeChild(this.modal);
    this.modal = null;
  }

  /**
   * Create the occupancy form modal HTML
   */
  createModal(preselectedBedId = null) {
    this.modal = document.createElement('div');
    this.modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    this.modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Atnaujinti užimtumą</h2>
            <button id="closeOccupancyForm" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <form id="occupancyForm" class="space-y-4">
            <!-- Bed Selection -->
            <div>
              <label for="occupancyBedId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Lova *
              </label>
              <select 
                id="occupancyBedId" 
                name="bedId"
                required
                class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pasirinkite lovą</option>
                ${BED_LAYOUT.map(bedId => 
                  `<option value="${bedId}" ${bedId === preselectedBedId ? 'selected' : ''}>${bedId}</option>`
                ).join('')}
              </select>
            </div>
            
            <!-- Status -->
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Užimtumas *
              </label>
              <div class="space-y-2">
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="free"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">🟢 Laisva</span>
                </label>
                
                <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="status" 
                    value="occupied"
                    required
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600"
                  >
                  <span class="text-slate-900 dark:text-slate-100">🔴 Užimta</span>
                </label>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="flex justify-end space-x-3 pt-4">
              <button 
                type="button" 
                id="cancelOccupancyForm"
                class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
              >
                Atšaukti
              </button>
              <button 
                type="submit"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Atnaujinti
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to the occupancy form
   */
  attachEventListeners() {
    // Close button
    this.modal.querySelector('#closeOccupancyForm').addEventListener('click', () => {
      this.hide();
    });

    // Cancel button
    this.modal.querySelector('#cancelOccupancyForm').addEventListener('click', () => {
      this.hide();
    });

    // Form submission
    this.modal.querySelector('#occupancyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Handle occupancy form submission
   */
  handleSubmit() {
    const formData = new FormData(this.modal.querySelector('#occupancyForm'));
    
    const occupancyData = {
      timestamp: new Date().toISOString(),
      bedId: formData.get('bedId'),
      status: formData.get('status')
    };

    // Validate required fields
    if (!occupancyData.bedId || !occupancyData.status) {
      alert('Prašome užpildyti visus laukus.');
      return;
    }

    // Submit the form
    if (this.onSubmit) {
      this.onSubmit(occupancyData);
    }

    this.hide();
  }
}
