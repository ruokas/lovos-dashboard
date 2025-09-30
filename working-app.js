// Simplified working version without modules
console.log('Starting simplified bed management app...');

// Basic data structures
const BED_LAYOUT = [
  'IT1', 'IT2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17',
  '121A', '121B'
];

const STATUS_OPTIONS = {
  CLEAN: '✅ Viskas tvarkinga',
  MESSY_BED: '🛏️ Netvarkinga lova',
  MISSING_EQUIPMENT: '🧰 Trūksta priemonių',
  OTHER: 'Other'
};

// Simple bed data storage
let bedData = new Map();
BED_LAYOUT.forEach(bedId => {
  bedData.set(bedId, {
    bedId: bedId,
    currentStatus: STATUS_OPTIONS.CLEAN,
    occupancyStatus: 'free',
    lastCheckedTime: null,
    lastCheckedBy: null,
    notifications: []
  });
});

// Simple occupancy form handler
function showOccupancyForm(bedId = null) {
  console.log('=== showOccupancyForm START ===');
  console.log('bedId:', bedId);
  console.log('bedData exists:', !!bedData);
  
  // Just show a simple alert for now
  alert('Occupancy form test - Bed ID: ' + (bedId || 'none'));
  
  console.log('=== showOccupancyForm END ===');
}

// Simple form handler
function showStatusForm(bedId = null) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
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
          <div>
            <label for="email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              El. paštas *
            </label>
            <input type="email" id="email" name="email" required
                   class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          
          <div>
            <label for="bedId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Lova *
            </label>
            <select id="bedId" name="bedId" required
                    class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Pasirinkite lovą</option>
              ${BED_LAYOUT.map(id => `<option value="${id}" ${id === bedId ? 'selected' : ''}>${id}</option>`).join('')}
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Būsena *
            </label>
            <div class="space-y-2">
              <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="radio" name="status" value="${STATUS_OPTIONS.CLEAN}" required
                       class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600">
                <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.CLEAN}</span>
              </label>
              
              <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="radio" name="status" value="${STATUS_OPTIONS.MESSY_BED}" required
                       class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600">
                <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.MESSY_BED}</span>
              </label>
              
              <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="radio" name="status" value="${STATUS_OPTIONS.MISSING_EQUIPMENT}" required
                       class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600">
                <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.MISSING_EQUIPMENT}</span>
              </label>
              
              <label class="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="radio" name="status" value="${STATUS_OPTIONS.OTHER}" required
                       class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600">
                <span class="text-slate-900 dark:text-slate-100">${STATUS_OPTIONS.OTHER}</span>
              </label>
            </div>
          </div>
          
          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" id="cancelForm"
                    class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors">
              Atšaukti
            </button>
            <button type="submit"
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
              Pranešti
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('#closeForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#cancelForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#bedStatusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const bedId = formData.get('bedId');
    const status = formData.get('status');
    const email = formData.get('email');
    
    if (bedId && status && email) {
      // Update bed data
      const bed = bedData.get(bedId);
      if (bed) {
        bed.currentStatus = status;
        bed.lastCheckedTime = new Date();
        bed.lastCheckedBy = email;
        bedData.set(bedId, bed);
        
        console.log('Updated bed:', bed);
        alert(`Lova ${bedId} atnaujinta: ${status}`);
        
        // Refresh display
        renderBedGrid();
      }
    }
    
    document.body.removeChild(modal);
  });
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Render bed grid
function renderBedGrid() {
  const gridContainer = document.getElementById('bedGrid');
  if (!gridContainer) return;
  
  gridContainer.innerHTML = BED_LAYOUT.map(bedId => {
    const bed = bedData.get(bedId);
    const statusClass = bed.currentStatus === STATUS_OPTIONS.CLEAN ? 'clean' : 'dirty';
    const occupancyClass = bed.occupancyStatus === 'occupied' ? 'occupied' : 'clean';
    
    return `
      <div class="bed-cell ${statusClass} ${occupancyClass}" data-bed-id="${bedId}">
        <div class="bed-id">${bedId}</div>
        <div class="bed-info">
          <div class="text-xs">${bed.currentStatus}</div>
          <div class="text-xs">${bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva'}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  const bedCells = document.querySelectorAll('.bed-cell');
  bedCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      const bedId = e.currentTarget.dataset.bedId;
      showStatusForm(bedId);
    });
    
    // Right-click for occupancy updates
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const bedId = e.currentTarget.dataset.bedId;
      showOccupancyForm(bedId);
    });
  });
}

// Render KPIs
function renderKPIs() {
  const kpiContainer = document.getElementById('kpis');
  if (!kpiContainer) return;
  
  const stats = {
    cleanBeds: Array.from(bedData.values()).filter(bed => bed.currentStatus === STATUS_OPTIONS.CLEAN).length,
    messyBeds: Array.from(bedData.values()).filter(bed => bed.currentStatus !== STATUS_OPTIONS.CLEAN).length,
    occupiedBeds: Array.from(bedData.values()).filter(bed => bed.occupancyStatus === 'occupied').length,
    totalBeds: bedData.size
  };
  
  kpiContainer.innerHTML = `
    <div class="card kpi-card bg-white dark:bg-slate-800">
      <h3 class="kpi-title">Sutvarkytos lovos</h3>
      <div class="kpi-value bg-emerald-100 text-emerald-800">${stats.cleanBeds}</div>
    </div>
    <div class="card kpi-card bg-white dark:bg-slate-800">
      <h3 class="kpi-title">Reikia sutvarkyti</h3>
      <div class="kpi-value bg-yellow-100 text-yellow-800">${stats.messyBeds}</div>
    </div>
    <div class="card kpi-card bg-white dark:bg-slate-800">
      <h3 class="kpi-title">Užimtos lovos</h3>
      <div class="kpi-value bg-rose-100 text-rose-800">${stats.occupiedBeds}</div>
    </div>
    <div class="card kpi-card bg-white dark:bg-slate-800">
      <h3 class="kpi-title">Iš viso lovų</h3>
      <div class="kpi-value bg-blue-100 text-blue-800">${stats.totalBeds}</div>
    </div>
  `;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing simplified app...');
  
  // Setup event listeners
  const addStatusBtn = document.getElementById('addStatusBtn');
  if (addStatusBtn) {
    console.log('Found addStatusBtn');
    addStatusBtn.addEventListener('click', () => {
      console.log('Status button clicked - test');
      alert('Status form would open here!');
    });
  } else {
    console.log('addStatusBtn not found');
  }
  
  const addOccupancyBtn = document.getElementById('addOccupancyBtn');
  console.log('Looking for addOccupancyBtn...');
  console.log('addOccupancyBtn element:', addOccupancyBtn);
  if (addOccupancyBtn) {
    console.log('Found addOccupancyBtn, adding event listener');
    addOccupancyBtn.addEventListener('click', (e) => {
      console.log('Add occupancy button clicked!');
      e.preventDefault();
      showOccupancyForm();
    });
    console.log('Event listener added successfully');
  } else {
    console.log('addOccupancyBtn not found');
  }
  
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('Refresh button clicked');
      
      // Add visual feedback
      refreshBtn.textContent = 'Atnaujinama...';
      refreshBtn.disabled = true;
      
      // Simulate a brief delay for visual feedback
      setTimeout(() => {
        renderBedGrid();
        renderKPIs();
        
        // Restore button
        refreshBtn.textContent = 'Atnaujinti';
        refreshBtn.disabled = false;
        
        console.log('Display refreshed');
      }, 500);
    });
  }
  
  // Initial render
  renderBedGrid();
  renderKPIs();
  
  console.log('Simplified app initialized successfully!');
  
  // Test if occupancy button exists
  setTimeout(() => {
    const testBtn = document.getElementById('addOccupancyBtn');
    console.log('Test: addOccupancyBtn found:', !!testBtn);
    if (testBtn) {
      console.log('Test: Button text:', testBtn.textContent.trim());
      console.log('Test: Button classes:', testBtn.className);
    }
  }, 1000);
});
