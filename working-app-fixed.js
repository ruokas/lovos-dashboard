console.log('Starting fixed bed management app...');

// CSV data URLs
const OCCUPANCY_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=603256423&single=true&output=csv';
const STATUS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=420109784&single=true&output=csv';
const WORKERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSju9ACW4Z1oa-GsD2Rs4hnNicNcP1qoZ6AINebI1DbAeXAwgeVyrWKqOLHT5BMfTW9_RpIU_W3qDKk/pub?gid=538054995&single=true&output=csv';

// Worker email to name mapping
let workerMap = new Map();

// Sound notification system
let soundEnabled = true;
let audioContext = null;
let lastNotificationHash = null; // Track notification changes

// Initialize audio context
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play notification sound based on priority
function playNotificationSound(priority) {
  console.log(`playNotificationSound called: priority=${priority}, soundEnabled=${soundEnabled}`);
  
  if (!soundEnabled) {
    console.log('Sound is disabled, skipping...');
    return;
  }
  
  try {
    initAudioContext();
    
    // Check if audio context is suspended (common browser issue)
    if (audioContext.state === 'suspended') {
      console.log('Audio context is suspended, attempting to resume...');
      audioContext.resume().then(() => {
        console.log('Audio context resumed successfully');
        playActualSound(priority);
      }).catch(error => {
        console.error('Failed to resume audio context:', error);
      });
      return;
    }
    
    playActualSound(priority);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
}

// Separate function for actual sound playing
function playActualSound(priority) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filterNode = audioContext.createBiquadFilter();
  
  // Softer frequencies for different priorities
  const frequencies = {
    1: 500, // Highest priority - softer high pitch (Messy bed)
    2: 400, // Missing equipment - medium pitch
    3: 350, // Other problem - medium-low pitch
    4: 300, // Recently freed - low pitch
    5: 250  // Lowest priority - very low pitch (Regular check)
  };
  
  // Longer, softer durations for different priorities
  const durations = {
    1: 1.2, // Longer sound for higher priority
    2: 1.0,
    3: 0.8,
    4: 0.6,
    5: 0.4
  };
  
  const frequency = frequencies[priority] || 350;
  const duration = durations[priority] || 0.8;
  
  console.log(`Playing sound: priority=${priority}, frequency=${frequency}Hz, duration=${duration}s`);
  
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.type = 'triangle'; // Softer than sine wave
  
  // Add low-pass filter for even softer sound
  filterNode.type = 'lowpass';
  filterNode.frequency.setValueAtTime(frequency * 2, audioContext.currentTime); // Cut off harsh frequencies
  filterNode.Q.setValueAtTime(1, audioContext.currentTime);
  
  // Create much softer envelope for gentler sound
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.12, audioContext.currentTime + 0.3); // Even slower rise, lower volume
  gainNode.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + duration * 0.6); // Gentle sustain
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration); // Very gentle fade
  
  oscillator.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
  
  console.log(`Sound played successfully for priority ${priority}`);
}

// Play different sound patterns for different notification types
function playNotificationPattern(type) {
  if (!soundEnabled) return;
  
  const patterns = {
    'critical_overdue': () => {
      // Critical overdue pattern: urgent critical sound
      playCriticalNotificationSound();
    },
    'messy_bed': () => {
      // Urgent but gentle pattern: 2 soft beeps with pause
      playNotificationSound(1);
      setTimeout(() => playNotificationSound(1), 800);
    },
    'missing_equipment': () => {
      // Equipment pattern: 1 medium beep
      playNotificationSound(2);
    },
    'other_problem': () => {
      // Problem pattern: 1 gentle beep
      playNotificationSound(3);
    },
    'recently_freed': () => {
      // Cleaning pattern: gentle ascending beeps
      playNotificationSound(4);
      setTimeout(() => playNotificationSound(3), 600);
    },
    'regular_check': () => {
      // Check pattern: single very gentle beep
      playNotificationSound(5);
    }
  };
  
  const pattern = patterns[type];
  if (pattern) { 
    pattern(); 
  }
}

// Play critical sound for overdue notifications
function playCriticalNotificationSound() {
  if (!soundEnabled) return;
  console.log('Playing critical notification sound for overdue bed');
  
  try {
    initAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        playCriticalSound();
      }).catch(error => {
        console.error('Failed to resume audio context for critical sound:', error);
      });
      return;
    }
    playCriticalSound();
  } catch (error) {
    console.error('Error playing critical notification sound:', error);
  }
}

function playCriticalSound() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filterNode = audioContext.createBiquadFilter();
  
  // Critical sound: higher frequency, longer duration, more urgent pattern
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.type = 'triangle';
  
  filterNode.type = 'lowpass';
  filterNode.frequency.setValueAtTime(1000, audioContext.currentTime);
  filterNode.Q.setValueAtTime(1, audioContext.currentTime);
  
  // More urgent envelope
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.2);
  gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.8);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
  
  oscillator.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 1.5);
  
  console.log('Critical sound played successfully');
}

// Create hash of current notifications to detect changes
function createNotificationHash(notifications) {
  return notifications.map(n => `${n.bedId}-${n.type}-${n.timestamp}`).sort().join('|');
}

// Check if notifications have changed and play sounds for new ones
function checkAndPlayNewNotificationSounds(notifications) {
  if (!soundEnabled) return;
  
  const currentHash = createNotificationHash(notifications);
  
  // If this is the first time or hash has changed, play sounds
  if (lastNotificationHash === null) {
    console.log('First notification calculation - not playing sounds');
    lastNotificationHash = currentHash;
    return;
  }
  
  if (currentHash !== lastNotificationHash) {
    console.log('Notifications changed - playing sounds for new notifications');
    
    // Find new notifications by comparing with previous state
    const previousNotifications = lastNotificationHash.split('|');
    const currentNotifications = currentHash.split('|');
    
    // Find new notifications
    const newNotifications = currentNotifications.filter(n => !previousNotifications.includes(n));
    
    // Play sounds for new notifications
            newNotifications.forEach(notificationKey => {
              const [bedId, type, timestamp] = notificationKey.split('-');
              console.log(`Playing sound for new notification: ${type} on bed ${bedId}`);
              
              // Find the actual notification to check if it's overdue
              const actualNotification = notifications.find(n => 
                `${n.bedId}-${n.type}-${n.timestamp}` === notificationKey
              );
              
              if (actualNotification && actualNotification.isOverdue) {
                console.log(`Playing critical sound for overdue notification: ${type} on bed ${bedId}`);
                playCriticalNotificationSound();
              } else {
                playNotificationPattern(type);
              }
            });
    
    lastNotificationHash = currentHash;
  } else {
    console.log('No notification changes - not playing sounds');
  }
}

// Test sound function
function testNotificationSounds() {
  console.log('=== TESTING NOTIFICATION SOUNDS ===');
  console.log('soundEnabled:', soundEnabled);
  console.log('audioContext:', audioContext);
  console.log('audioContext state:', audioContext ? audioContext.state : 'not initialized');
  
  const testSequence = [
    { type: 'critical_overdue', delay: 0 },
    { type: 'messy_bed', delay: 2000 },
    { type: 'missing_equipment', delay: 4000 },
    { type: 'other_problem', delay: 6000 },
    { type: 'recently_freed', delay: 8000 },
    { type: 'regular_check', delay: 10000 }
  ];
  
  testSequence.forEach(test => {
    setTimeout(() => {
      console.log(`Testing sound for: ${test.type}`);
      playNotificationPattern(test.type);
    }, test.delay);
  });
  
  console.log('=== TEST SEQUENCE STARTED ===');
}

// Load CSV data from Google Sheets
async function loadCSVData(url, dataType = 'occupancy') {
  try {
    console.log(`Loading ${dataType} CSV data from:`, url);
    const response = await fetch(url);
    const csvText = await response.text();
    
    // Parse CSV data
    const lines = csvText.split('\n');
    const separator = ',';
    const headers = lines[0].split(separator);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(separator);
        if (values.length >= (dataType === 'workers' ? 2 : 3)) {
          if (dataType === 'occupancy') {
            data.push({
              timestamp: values[0],
              bedId: values[1],
              status: values[2]
            });
          } else if (dataType === 'status') {
            data.push({
              timestamp: values[0],
              email: values[1],
              bedId: values[2],
              status: values[3]
            });
          } else if (dataType === 'workers') {
            // Parse workers CSV: email,Vardas (comma-separated)
            // Headers: email,Vardas
            if (values.length >= 2) {
              const email = values[0].trim();
              const name = values[1].trim();
              if (email && name && email.includes('@')) {
                workerMap.set(email, name);
                console.log(`Worker mapping: ${email} -> ${name}`);
              }
            }
          }
        }
      }
    }
    
    console.log(`Loaded ${dataType} CSV data:`, dataType === 'workers' ? workerMap.size : data.length, 'records');
    return dataType === 'workers' ? workerMap : data;
  } catch (error) {
    console.error(`Error loading ${dataType} CSV data:`, error);
    return dataType === 'workers' ? new Map() : [];
  }
}

// Convert email to worker name
function getWorkerName(name) {
  // Since we now store names directly, just return the name
  return name || 'Nežinomas';
}

// Load workers data only once
async function loadWorkersData() {
  if (workerMap.size > 0) {
    console.log('Workers already loaded, skipping...');
    return;
  }
  
  console.log('Loading workers data...');
  try {
    await loadCSVData(WORKERS_CSV_URL, 'workers');
    console.log('Workers loaded:', workerMap.size, 'workers');
    console.log('Sample workers:', Array.from(workerMap.entries()).slice(0, 5));
  } catch (error) {
    console.error('Failed to load workers data:', error);
  }
}

// Update bed data with latest CSV data
// Loading state management
function showLoadingState() {
  const bedGrid = document.getElementById('bedGrid');
  const notificationSummary = document.getElementById('notificationSummary');
  const kpis = document.getElementById('kpis');
  
  if (bedGrid) {
    bedGrid.innerHTML = `
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span class="ml-3 text-gray-600 dark:text-gray-400">Kraunami duomenys...</span>
      </div>
    `;
  }
  
  if (notificationSummary) {
    notificationSummary.innerHTML = `
      <div class="flex items-center justify-center py-4">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span class="ml-2 text-gray-600 dark:text-gray-400">Atnaujinama...</span>
      </div>
    `;
  }
  
  if (kpis) {
    kpis.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        ${Array(4).fill().map(() => `
          <div class="card kpi-card bg-white dark:bg-slate-800 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

async function updateBedDataFromCSV() {
  console.log('Loading occupancy and status data...');
  
  // Show loading state
  showLoadingState();
  
  try {
    // Load occupancy and status data in parallel
    const [occupancyData, statusData] = await Promise.all([
      loadCSVData(OCCUPANCY_CSV_URL, 'occupancy'),
      loadCSVData(STATUS_CSV_URL, 'status')
    ]);
    
    console.log('Data loaded - Occupancy:', occupancyData.length, 'Status:', statusData.length);
  
  // Process occupancy data
  if (occupancyData.length > 0) {
    const bedStatusMap = new Map();
    
    occupancyData.forEach(record => {
      const bedId = record.bedId.trim();
      const status = record.status.trim();
      
      // Only process beds that are in our layout
      if (BED_LAYOUT.includes(bedId)) {
        if (!bedStatusMap.has(bedId) || record.timestamp > bedStatusMap.get(bedId).timestamp) {
          bedStatusMap.set(bedId, {
            timestamp: record.timestamp,
            occupancyStatus: status === 'Užimta' ? 'occupied' : 'free'
          });
        }
      }
    });
    
    // Update bed data with occupancy information
    bedStatusMap.forEach((data, bedId) => {
      const bed = bedData.get(bedId);
      if (bed) {
        // Check if occupancy status changed from occupied to free
        if (bed.occupancyStatus === 'occupied' && data.occupancyStatus === 'free') {
          console.log(`Bed ${bedId} was just freed!`);
          bed.lastFreedTime = data.timestamp;
        }
        
        bed.occupancyStatus = data.occupancyStatus;
        bed.lastOccupancyUpdate = data.timestamp;
        bedData.set(bedId, bed);
      }
    });
    
    console.log('Updated occupancy data from CSV:', bedStatusMap.size, 'beds');
  }
  
  // Process status data
  if (statusData.length > 0) {
    const bedStatusMap = new Map();
    
    statusData.forEach(record => {
      const bedId = record.bedId.trim();
      const status = record.status.trim();
      
      // Only process beds that are in our layout
      if (BED_LAYOUT.includes(bedId) && status) {
        if (!bedStatusMap.has(bedId) || record.timestamp > bedStatusMap.get(bedId).timestamp) {
          bedStatusMap.set(bedId, {
            timestamp: record.timestamp,
            status: status,
            email: record.email || 'Nežinomas'
          });
        }
      }
    });
    
    // Update bed data with status information
    bedStatusMap.forEach((data, bedId) => {
      const bed = bedData.get(bedId);
      if (bed) {
        bed.currentStatus = data.status;
        bed.lastUpdated = data.timestamp;
        bed.lastCheckedBy = data.email; // Store email, but display name
        bedData.set(bedId, bed);
      }
    });
    
    console.log('Updated status data from CSV:', bedStatusMap.size, 'beds');
  }
  
  // Refresh the display
  renderBedGrid();
  renderKPIs();
  renderNotifications();
  } catch (error) {
    console.error('Error updating bed data from CSV:', error);
    // Show error state
    const bedGrid = document.getElementById('bedGrid');
    if (bedGrid) {
      bedGrid.innerHTML = `
        <div class="flex items-center justify-center py-8 text-red-600">
          <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Klaida kraunant duomenis</span>
        </div>
      `;
    }
  }
}

// Bed layout and status options
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

// Initialize bed data
const bedData = new Map();
BED_LAYOUT.forEach(bedId => {
  bedData.set(bedId, {
    id: bedId,
    currentStatus: STATUS_OPTIONS.CLEAN,
    occupancyStatus: 'free',
    lastUpdated: new Date().toISOString(),
    lastOccupancyUpdate: new Date().toISOString(),
    lastFreedTime: null,
    lastCheckedBy: null,
    notifications: []
  });
});

// Calculate notifications for all beds
function calculateNotifications() {
  const now = new Date();
  const allNotifications = [];
  
  // Load settings
  const savedSettings = localStorage.getItem('bedManagementSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {
    priorityMessyBed: 1,
    priorityMissingEquipment: 2,
    priorityOtherProblem: 3,
    priorityRecentlyFreed: 4,
    priorityRegularCheck: 5,
    recentlyFreedThreshold: 1,
    regularCheckThreshold: 2,
    overdueThreshold: 1 // hours before problem becomes overdue
  };
  
  bedData.forEach((bed, bedId) => {
    bed.notifications = [];
    
    // Priority 1: Messy bed
    if (bed.currentStatus === STATUS_OPTIONS.MESSY_BED) {
      const hoursSinceReported = bed.lastUpdated ? (now - new Date(bed.lastUpdated)) / (1000 * 60 * 60) : 0;
      const isOverdue = hoursSinceReported >= settings.overdueThreshold; // Use configurable threshold
      
      const notification = {
        type: 'messy_bed',
        priority: isOverdue ? 0 : settings.priorityMessyBed, // Priority 0 for overdue
        message: isOverdue ? '🚨 VĖLUOJAMA: Netvarkinga lova' : '🛏️ Netvarkinga lova',
        timestamp: bed.lastUpdated,
        bedId: bedId,
        isOverdue: isOverdue,
        hoursSinceReported: hoursSinceReported
      };
      bed.notifications.push(notification);
      allNotifications.push(notification);
    }
    
    // Priority 2: Missing equipment
    if (bed.currentStatus === STATUS_OPTIONS.MISSING_EQUIPMENT) {
      const hoursSinceReported = bed.lastUpdated ? (now - new Date(bed.lastUpdated)) / (1000 * 60 * 60) : 0;
      const isOverdue = hoursSinceReported >= settings.overdueThreshold; // Use configurable threshold
      
      const notification = {
        type: 'missing_equipment',
        priority: isOverdue ? 0 : settings.priorityMissingEquipment, // Priority 0 for overdue
        message: isOverdue ? '🚨 VĖLUOJAMA: Trūksta priemonių' : '🧰 Trūksta priemonių',
        timestamp: bed.lastUpdated,
        bedId: bedId,
        isOverdue: isOverdue,
        hoursSinceReported: hoursSinceReported
      };
      bed.notifications.push(notification);
      allNotifications.push(notification);
    }
    
    // Priority 3: Other problem (custom status)
    if (bed.currentStatus !== STATUS_OPTIONS.CLEAN && 
        bed.currentStatus !== STATUS_OPTIONS.MESSY_BED && 
        bed.currentStatus !== STATUS_OPTIONS.MISSING_EQUIPMENT) {
      const hoursSinceReported = bed.lastUpdated ? (now - new Date(bed.lastUpdated)) / (1000 * 60 * 60) : 0;
      const isOverdue = hoursSinceReported >= settings.overdueThreshold; // Use configurable threshold
      
      const notification = {
        type: 'other_problem',
        priority: isOverdue ? 0 : settings.priorityOtherProblem, // Priority 0 for overdue
        message: isOverdue ? `🚨 VĖLUOJAMA: Kita problema: ${bed.currentStatus}` : `⚠️ Kita problema: ${bed.currentStatus}`,
        timestamp: bed.lastUpdated,
        bedId: bedId,
        isOverdue: isOverdue,
        hoursSinceReported: hoursSinceReported
      };
      bed.notifications.push(notification);
      allNotifications.push(notification);
    }
    
    // Priority 4: Recently freed (needs cleaning)
    if (bed.lastFreedTime) {
      const hoursSinceFreed = (now - new Date(bed.lastFreedTime)) / (1000 * 60 * 60);
      if (hoursSinceFreed <= settings.recentlyFreedThreshold) {
        const notification = {
          type: 'recently_freed',
          priority: settings.priorityRecentlyFreed,
          message: '🧹 Ką tik atlaisvinta - reikia sutvarkyti',
          timestamp: bed.lastFreedTime,
          bedId: bedId,
          hoursSinceFreed: hoursSinceFreed
        };
        bed.notifications.push(notification);
        allNotifications.push(notification);
      }
    }
    
    // Priority 5: Regular check needed for occupied beds
    if (bed.occupancyStatus === 'occupied' && bed.lastOccupancyUpdate) {
      const hoursSinceOccupied = (now - new Date(bed.lastOccupancyUpdate)) / (1000 * 60 * 60);
      if (hoursSinceOccupied >= settings.regularCheckThreshold) {
        const notification = {
          type: 'regular_check',
          priority: settings.priorityRegularCheck,
          message: '🔄 Reikia tikrinti užimtą lovą',
          timestamp: bed.lastOccupancyUpdate,
          bedId: bedId,
          hoursSinceOccupied: hoursSinceOccupied
        };
        bed.notifications.push(notification);
        allNotifications.push(notification);
      }
    }
  });
  
  const sortedNotifications = allNotifications.sort((a, b) => a.priority - b.priority);
  
  // Check for new notifications and play sounds
  checkAndPlayNewNotificationSounds(sortedNotifications);
  
  return sortedNotifications;
}

// Render notifications
function renderNotifications() {
  // Clear notification hash to prevent sounds on UI update
  clearNotificationHash();
  
  const notificationContainer = document.getElementById('notificationSummary');
  if (!notificationContainer) return;
  
  const notifications = calculateNotifications();
  
  if (notifications.length === 0) {
    notificationContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <div class="text-4xl mb-4">✅</div>
        <div class="text-lg font-medium mb-2">Nėra aktyvių pranešimų</div>
        <div class="text-sm text-gray-400">Visos lovos tvarkingos ir nereikia jokių veiksmų</div>
      </div>
    `;
    return;
  }
  
  notificationContainer.innerHTML = `
    <div class="space-y-3">
      ${notifications.map(notification => {
        const priorityColors = {
          0: 'border-red-500 text-red-900', // Critical overdue
          1: 'border-red-300 text-red-800',
          2: 'border-orange-300 text-orange-800', 
          3: 'border-yellow-300 text-yellow-800',
          4: 'border-green-300 text-green-800',
          5: 'border-blue-300 text-blue-800'
        };
        
        const priorityText = {
          0: 'KRITINIS VĖLUOJAMA',
          1: 'KRITINIS',
          2: 'AUKŠTAS',
          3: 'VIDUTINIS', 
          4: 'ŽEMAS',
          5: 'ŽEMAS'
        };
        
        const timeAgo = notification.hoursSinceFreed || notification.hoursSinceOccupied;
        const timeText = timeAgo ? ` (prieš ${Math.round(timeAgo * 10) / 10} val.)` : '';
        
        // Get bed data for additional info
        const bed = bedData.get(notification.bedId);
        const lastCheckedBy = bed ? getWorkerName(bed.lastCheckedBy) : 'Nežinomas';
        const lastCheckedTime = bed ? bed.lastUpdated : notification.timestamp;
        const formattedTime = lastCheckedTime ? new Date(lastCheckedTime).toLocaleString('lt-LT') : 'Nėra duomenų';
        
        const priorityBgColors = {
          0: 'var(--status-critical-bg)', // Critical overdue background
          1: 'var(--status-messy-bg)',
          2: 'var(--status-missing-bg)', 
          3: 'var(--status-other-bg)',
          4: 'var(--status-clean-bg)',
          5: 'var(--primary-blue-light)'
        };
        
        const priorityTextColors = {
          0: 'var(--status-critical-text)', // Critical overdue text
          1: 'var(--status-messy-text)',
          2: 'var(--status-missing-text)', 
          3: 'var(--status-other-text)',
          4: 'var(--status-clean-text)',
          5: 'var(--primary-blue)'
        };
        
        // Check if notification is overdue for critical styling
        const isOverdue = notification.isOverdue || false;
        const criticalBorderColor = isOverdue ? '#dc2626' : (priorityTextColors[notification.priority] || 'var(--gray-300)');
        const criticalBackgroundColor = isOverdue ? '#fef2f2' : 'var(--gray-50)';
        const criticalTextColor = isOverdue ? '#dc2626' : 'var(--text-primary)';
        const criticalSecondaryTextColor = isOverdue ? '#991b1b' : 'var(--text-secondary)';
        
        return `
          <div class="flex items-start justify-between p-4 rounded-lg border ${isOverdue ? 'ring-2 ring-red-300 animate-pulse' : ''}" style="background-color: ${criticalBackgroundColor}; border-color: var(--gray-200); border-left: 4px solid ${criticalBorderColor};">
            <div class="flex items-center space-x-4 flex-1">
              <div class="px-3 py-1 rounded-md ${isOverdue ? 'ring-2 ring-red-300' : ''}" style="background-color: ${isOverdue ? '#dc2626' : 'var(--text-primary)'};">
                <span class="${getFontSizeClass('text-base')} font-bold" style="color: var(--gray-50);">Lova ${notification.bedId}</span>
              </div>
              <div class="font-medium ${getFontSizeClass('text-base')}" style="color: ${criticalTextColor};">
                ${notification.message}
                ${isOverdue ? `<span class="ml-2 text-xs font-bold" style="color: #dc2626;">(${Math.round(notification.hoursSinceReported * 10) / 10}h)</span>` : ''}
              </div>
              <div class="${getFontSizeClass('text-sm')}" style="color: var(--text-tertiary);">
                ${timeText ? timeText : ''}
              </div>
            </div>
            <div class="flex items-center space-x-3 ${getFontSizeClass('text-sm')}" style="color: ${criticalSecondaryTextColor};">
              <span class="flex items-center space-x-1">
                <span>📅</span>
                <span>${formattedTime}</span>
              </span>
              <span class="flex items-center space-x-1">
                <span>👤</span>
                <span>${lastCheckedBy}</span>
              </span>
              <button onclick="showStatusForm('${notification.bedId}')" 
                      class="px-4 py-2 rounded ${getFontSizeClass('text-sm')} hover:bg-opacity-75 transition-colors font-medium ${isOverdue ? 'ring-2 ring-red-300' : ''}" 
                      style="background-color: ${isOverdue ? '#dc2626' : 'var(--primary-blue)'}; color: white;">
                ${isOverdue ? '🚨 VĖLUOJAMA' : 'Tikrinti'}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Simple status form handler
function showStatusForm(bedId = null) {
  console.log('showStatusForm called with bedId:', bedId);
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
      <div class="p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Pranešti apie būklę</h2>
          <button id="closeStatusForm" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <form id="statusForm" class="space-y-4">
          <div>
            <label for="statusBedId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Lova *
            </label>
            <select id="statusBedId" name="bedId" required
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
          
          <div id="otherTextDiv" class="hidden">
            <label for="otherText" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Aprašykite problemą *
            </label>
            <textarea id="otherText" name="otherText" rows="3"
                      class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Aprašykite problemą..."></textarea>
          </div>
          
          <div>
            <label for="name" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Vardas *
            </label>
            <input type="text" id="name" name="name" required
                   class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="Įveskite savo vardą">
          </div>
          
          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" id="cancelStatusForm"
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
  
  // Show/hide other text based on radio selection
  const otherRadio = modal.querySelector('input[value="Other"]');
  const otherTextDiv = modal.querySelector('#otherTextDiv');
  const otherTextInput = modal.querySelector('#otherText');
  
  modal.querySelectorAll('input[name="status"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === STATUS_OPTIONS.OTHER) {
        otherTextDiv.classList.remove('hidden');
        otherTextInput.required = true;
      } else {
        otherTextDiv.classList.add('hidden');
        otherTextInput.required = false;
      }
    });
  });
  
  // Event listeners
  modal.querySelector('#closeStatusForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#cancelStatusForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#statusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const bedId = formData.get('bedId');
    const status = formData.get('status');
    const otherText = formData.get('otherText');
    const name = formData.get('name');
    
    if (bedId && status && name) {
      const bed = bedData.get(bedId);
      if (bed) {
        const oldStatus = bed.currentStatus;
        
        // Update bed status
        bed.currentStatus = status;
        bed.lastUpdated = new Date().toISOString();
        bed.lastCheckedBy = name; // Store name directly
        
        // If it's "Other" status, store the custom text
        if (status === STATUS_OPTIONS.OTHER && otherText) {
          bed.currentStatus = `${STATUS_OPTIONS.OTHER}: ${otherText}`;
        }
        
        bedData.set(bedId, bed);
        
        // Add to history
        addToHistory('status_update', bedId, {
          oldStatus: oldStatus,
          newStatus: bed.currentStatus,
          updatedBy: name
        });
        
        console.log('Updated bed status:', bed);
        
        const statusText = status === STATUS_OPTIONS.CLEAN ? 'Švari' : 
                          status === STATUS_OPTIONS.MESSY_BED ? 'Netvarkinga' :
                          status === STATUS_OPTIONS.MISSING_EQUIPMENT ? 'Trūksta priemonių' : 'Kita problema';
        
        alert(`Lova ${bedId} būsena atnaujinta: ${statusText}`);
        
        // Refresh display
        renderBedGrid();
        renderKPIs();
        renderNotifications();
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

// Settings modal handler
function showSettingsModal() {
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full">
      <div class="p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Pranešti apie būklę</h2>
          <button id="closeStatusForm" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <form id="statusForm" class="space-y-4">
          <div>
            <label for="statusBedId" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Lova *
            </label>
            <select id="statusBedId" name="bedId" required
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
          
          <div id="otherStatusDiv" class="hidden">
            <label for="otherStatusText" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Aprašykite problemą
            </label>
            <textarea id="otherStatusText" name="otherText" rows="3"
                      class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Aprašykite problemą..."></textarea>
          </div>
          
          <div>
            <label for="reporterEmail" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              El. paštas
            </label>
            <input type="email" id="reporterEmail" name="email"
                   class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="jūsų@el.paštas.lt">
          </div>
          
          <div class="flex justify-end space-x-3 pt-4">
            <button type="button" id="cancelStatusForm"
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
  
  // Show/hide "Other" text area based on radio selection
  const statusRadios = modal.querySelectorAll('input[name="status"]');
  const otherStatusDiv = modal.querySelector('#otherStatusDiv');
  
  statusRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === STATUS_OPTIONS.OTHER) {
        otherStatusDiv.classList.remove('hidden');
      } else {
        otherStatusDiv.classList.add('hidden');
      }
    });
  });
  
  // Close button handlers
  modal.querySelector('#closeStatusForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#cancelStatusForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Form submission handler
  modal.querySelector('#statusForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const bedId = formData.get('bedId');
    const status = formData.get('status');
    const otherText = formData.get('otherText');
    const name = formData.get('name');
    
    if (bedId && status && name) {
      const bed = bedData.get(bedId);
      if (bed) {
        const oldStatus = bed.currentStatus;
        
        // Update bed status
        bed.currentStatus = status;
        bed.lastUpdated = new Date().toISOString();
        bed.lastCheckedBy = name; // Store name directly
        
        // If it's "Other" status, store the custom text
        if (status === STATUS_OPTIONS.OTHER && otherText) {
          bed.currentStatus = `${STATUS_OPTIONS.OTHER}: ${otherText}`;
        }
        
        bedData.set(bedId, bed);
        
        // Add to history
        addToHistory('status_update', bedId, {
          oldStatus: oldStatus,
          newStatus: bed.currentStatus,
          updatedBy: name
        });
        
        console.log('Updated bed status:', bed);
        
        const statusText = status === STATUS_OPTIONS.CLEAN ? 'Švari' : 
                          status === STATUS_OPTIONS.MESSY_BED ? 'Netvarkinga' :
                          status === STATUS_OPTIONS.MISSING_EQUIPMENT ? 'Trūksta priemonių' : 'Kita problema';
        
        alert(`Lova ${bedId} būsena atnaujinta: ${statusText}`);
        
        // Refresh display
        renderBedGrid();
        renderKPIs();
        renderNotifications();
      }
    }
    
    document.body.removeChild(modal);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Render bed list with badges
// Global variables for search and view state
let currentSearchTerm = '';
let isGridView = false;

// History tracking
function addToHistory(action, bedId, details) {
  const history = JSON.parse(localStorage.getItem('bedManagementHistory') || '[]');
  const historyItem = {
    timestamp: new Date().toISOString(),
    action: action,
    bedId: bedId,
    details: details,
    user: 'System' // Could be enhanced to track actual user
  };
  
  history.unshift(historyItem); // Add to beginning
  history.splice(50); // Keep only last 50 items
  
  localStorage.setItem('bedManagementHistory', JSON.stringify(history));
}

function getHistory() {
  return JSON.parse(localStorage.getItem('bedManagementHistory') || '[]');
}

// Search functionality
function filterBeds(searchTerm) {
  currentSearchTerm = searchTerm.toLowerCase();
  renderBedGrid();
}

// Toggle between grid and list view
function toggleView() {
  isGridView = !isGridView;
  const toggleBtn = document.getElementById('viewToggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = isGridView ? 
      `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
      </svg>` :
      `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>`;
  }
  renderBedGrid();
}

function renderBedGrid() {
  // Clear notification hash to prevent sounds on UI update
  clearNotificationHash();
  
  const gridContainer = document.getElementById('bedGrid');
  if (!gridContainer) return;
  
  // Filter beds based on search term
  const filteredBeds = BED_LAYOUT.filter(bedId => {
    if (!currentSearchTerm) return true;
    return bedId.toLowerCase().includes(currentSearchTerm);
  });
  
  if (isGridView) {
    // Grid view
    gridContainer.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';
    gridContainer.innerHTML = filteredBeds.map(bedId => {
      const bed = bedData.get(bedId);
      const statusBadgeClass = bed.currentStatus === STATUS_OPTIONS.CLEAN ? 'bg-green-100 text-green-800' :
                              bed.currentStatus === STATUS_OPTIONS.MESSY_BED ? 'bg-red-100 text-red-800' :
                              bed.currentStatus === STATUS_OPTIONS.MISSING_EQUIPMENT ? 'bg-yellow-100 text-yellow-800' :
                              'bg-orange-100 text-orange-800';
      
      const occupancyBadgeClass = bed.occupancyStatus === 'occupied' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';
      const occupancyText = bed.occupancyStatus === 'occupied' ? '🔴' : '🟢';
      
      return `
        <div class="bed-item bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-center" data-bed-id="${bedId}">
          <div class="text-lg font-semibold text-gray-900 mb-2">Lova ${bedId}</div>
          <div class="space-y-2">
            <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}">
              ${bed.currentStatus}
            </div>
            <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${occupancyBadgeClass}">
              ${occupancyText}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    // List view (existing)
    gridContainer.className = 'space-y-2';
    gridContainer.innerHTML = filteredBeds.map(bedId => {
    const bed = bedData.get(bedId);
    const lastUpdated = bed.lastUpdated ? new Date(bed.lastUpdated).toLocaleString('lt-LT') : 'Nėra duomenų';
    const lastCheckedBy = getWorkerName(bed.lastCheckedBy) || 'Nežinomas';
    
    // Determine status badge color using CSS variables
    let statusBadgeStyle = 'background-color: var(--gray-100); color: var(--gray-800);';
    if (bed.currentStatus === STATUS_OPTIONS.CLEAN) {
      statusBadgeStyle = 'background-color: var(--status-clean-bg); color: var(--status-clean-text);';
    } else if (bed.currentStatus === STATUS_OPTIONS.MESSY_BED) {
      statusBadgeStyle = 'background-color: var(--status-messy-bg); color: var(--status-messy-text);';
    } else if (bed.currentStatus === STATUS_OPTIONS.MISSING_EQUIPMENT) {
      statusBadgeStyle = 'background-color: var(--status-missing-bg); color: var(--status-missing-text);';
    } else {
      statusBadgeStyle = 'background-color: var(--status-other-bg); color: var(--status-other-text);';
    }
    
    // Determine occupancy badge color using CSS variables
    const occupancyBadgeStyle = bed.occupancyStatus === 'occupied' 
      ? 'background-color: var(--status-occupied-bg); color: var(--status-occupied-text);'
      : 'background-color: var(--status-free-bg); color: var(--status-free-text);';
    const occupancyText = bed.occupancyStatus === 'occupied' ? '🔴 Užimta' : '🟢 Laisva';
    
    return `
      <div class="flex items-center justify-between p-1 rounded-lg border" style="background-color: var(--gray-50); border-color: var(--gray-200); border-left: 4px solid ${bed.currentStatus === STATUS_OPTIONS.CLEAN ? 'var(--status-clean)' : 'var(--status-messy)'};" data-bed-id="${bedId}">
        <div class="flex items-center space-x-2 flex-1">
          <div class="px-2 py-0.5 rounded-md" style="background-color: var(--text-primary);">
            <span class="${getFontSizeClass('text-base')} font-bold" style="color: var(--gray-50);">Lova ${bedId}</span>
          </div>
          <div class="font-medium ${getFontSizeClass('text-base')}" style="color: var(--text-primary);">${bed.currentStatus}</div>
          <div class="${getFontSizeClass('text-xs')}" style="color: var(--text-tertiary);">
            ${occupancyText}
          </div>
        </div>
        <div class="flex items-center space-x-1 ${getFontSizeClass('text-xs')}" style="color: var(--text-secondary);">
          <span>📅 ${lastUpdated}</span>
          <span>👤 ${lastCheckedBy}</span>
          <button onclick="showStatusForm('${bedId}')" 
                  class="px-3 py-1 rounded ${getFontSizeClass('text-xs')} hover:bg-opacity-75 transition-colors font-medium" style="background-color: var(--primary-blue); color: white;">
            Tikrinti
          </button>
        </div>
      </div>
    `;
    }).join('');
  }
  
  // Add click handlers
  const bedItems = document.querySelectorAll('[data-bed-id]');
  bedItems.forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't trigger if clicking on the button
      if (e.target.tagName === 'BUTTON') return;
      
      const bedId = e.currentTarget.dataset.bedId;
      showStatusForm(bedId);
    });
  });
}

// Increase font size for notifications
// Clear notification hash when font size changes (to prevent sounds on UI updates)
function clearNotificationHash() {
  console.log('Clearing notification hash due to UI update');
  lastNotificationHash = null;
}

function increaseFontSize() {
  console.log('=== increaseFontSize START ===');
  const currentSize = parseInt(localStorage.getItem('notificationFontSize') || '0');
  console.log('Current size:', currentSize);
  const newSize = Math.min(currentSize + 1, 3); // Max 3 levels
  console.log('New size:', newSize);
  
  localStorage.setItem('notificationFontSize', newSize.toString());
  console.log('Saved to localStorage:', localStorage.getItem('notificationFontSize'));
  
  // Clear notification hash to prevent sounds on UI update
  clearNotificationHash();
  
  // Re-render notifications and bed list
  console.log('Re-rendering...');
  renderNotifications();
  renderBedGrid();
  console.log('=== increaseFontSize END ===');
}

// Decrease font size for notifications
function decreaseFontSize() {
  const currentSize = parseInt(localStorage.getItem('notificationFontSize') || '0');
  const newSize = Math.max(currentSize - 1, 0); // Min 0 levels
  
  localStorage.setItem('notificationFontSize', newSize.toString());
  
  // Clear notification hash to prevent sounds on UI update
  clearNotificationHash();
  
  // Re-render notifications and bed list
  renderNotifications();
  renderBedGrid();
}

// Initialize font size setting
function initializeFontSize() {
  const currentSize = localStorage.getItem('notificationFontSize');
  if (!currentSize || isNaN(parseInt(currentSize))) {
    console.log('Initializing font size to 0');
    localStorage.setItem('notificationFontSize', '0');
  }
}

// Get font size class based on current setting
function getFontSizeClass(baseClass) {
  const fontSizeStr = localStorage.getItem('notificationFontSize') || '0';
  const fontSize = parseInt(fontSizeStr);
  console.log('getFontSizeClass - fontSizeStr:', fontSizeStr, 'fontSize:', fontSize, 'baseClass:', baseClass);
  
  // Check if fontSize is valid number
  if (isNaN(fontSize)) {
    console.log('getFontSizeClass - fontSize is NaN, using 0');
    return baseClass;
  }
  
  // Apply font size multiplier based on level
  for (let i = 0; i < fontSize; i++) {
    baseClass = baseClass.replace('text-xs', 'text-sm')
                        .replace('text-sm', 'text-base')
                        .replace('text-base', 'text-lg')
                        .replace('text-lg', 'text-xl');
  }
  
  console.log('getFontSizeClass - result:', baseClass);
  return baseClass;
}

// Render KPIs
function renderKPIs() {
  const kpiContainer = document.getElementById('kpis');
  if (!kpiContainer) return;
  
  const notifications = calculateNotifications();
  const messyNotifications = notifications.filter(n => 
    n.type === 'messy_bed' || n.type === 'missing_equipment' || n.type === 'other_problem'
  );
  const stats = {
    cleanBeds: Array.from(bedData.values()).filter(bed => bed.currentStatus === STATUS_OPTIONS.CLEAN).length,
    messyBeds: Array.from(bedData.values()).filter(bed => bed.currentStatus !== STATUS_OPTIONS.CLEAN).length,
    occupiedBeds: Array.from(bedData.values()).filter(bed => bed.occupancyStatus === 'occupied').length,
    bedsToCheck: notifications.length - messyNotifications.length
  };
  
  const totalBeds = bedData.size;
  const cleanPercentage = totalBeds > 0 ? Math.round((stats.cleanBeds / totalBeds) * 100) : 0;
  const messyPercentage = totalBeds > 0 ? Math.round((stats.messyBeds / totalBeds) * 100) : 0;
  const occupiedPercentage = totalBeds > 0 ? Math.round((stats.occupiedBeds / totalBeds) * 100) : 0;
  const checkPercentage = totalBeds > 0 ? Math.round((stats.bedsToCheck / totalBeds) * 100) : 0;

  console.log('KPI Debug:', {
    totalBeds,
    cleanBeds: stats.cleanBeds,
    messyBeds: stats.messyBeds,
    occupiedBeds: stats.occupiedBeds,
    bedsToCheck: stats.bedsToCheck,
    cleanPercentage,
    messyPercentage,
    occupiedPercentage,
    checkPercentage
  });

          kpiContainer.innerHTML = `
            <div class="card kpi-card bg-white dark:bg-slate-800 hover:shadow-lg transition-shadow duration-300" style="--progress-color: var(--status-clean); --progress-width: ${cleanPercentage}%;">
              <h3 class="kpi-title">Sutvarkytos</h3>
              <div class="kpi-value" style="background-color: var(--gray-50); color: var(--text-primary);">${stats.cleanBeds}</div>
            </div>
            <div class="card kpi-card bg-white dark:bg-slate-800 hover:shadow-lg transition-shadow duration-300" style="--progress-color: var(--status-messy); --progress-width: ${messyPercentage}%;">
              <h3 class="kpi-title">Reikia tvarkyti</h3>
              <div class="kpi-value" style="background-color: var(--gray-50); color: var(--text-primary);">${stats.messyBeds}</div>
            </div>
            <div class="card kpi-card bg-white dark:bg-slate-800 hover:shadow-lg transition-shadow duration-300" style="--progress-color: var(--status-occupied); --progress-width: ${occupiedPercentage}%;">
              <h3 class="kpi-title">Užimtos</h3>
              <div class="kpi-value" style="background-color: var(--gray-50); color: var(--text-primary);">${stats.occupiedBeds}</div>
            </div>
            <div class="card kpi-card bg-white dark:bg-slate-800 hover:shadow-lg transition-shadow duration-300" style="--progress-color: var(--status-missing); --progress-width: ${checkPercentage}%;">
              <h3 class="kpi-title">Reikia tikrinti</h3>
              <div class="kpi-value" style="background-color: var(--gray-50); color: var(--text-primary);">${stats.bedsToCheck}</div>
            </div>
          `;
}

// Settings modal handler
function showSettingsModal() {
  console.log('=== showSettingsModal START ===');
  console.log('showSettingsModal called');
  
  // Load current settings
  const savedSettings = localStorage.getItem('bedManagementSettings');
  const currentSettings = savedSettings ? JSON.parse(savedSettings) : {
    autoNotifications: true,
    checkInterval: 30,
    soundNotifications: true,
    autoSave: true,
    // Priority settings (lower number = higher priority)
    priorityMessyBed: 1,
    priorityMissingEquipment: 2,
    priorityOtherProblem: 3,
    priorityRecentlyFreed: 4,
    priorityRegularCheck: 5,
    // Time thresholds
    recentlyFreedThreshold: 1, // hours
    regularCheckThreshold: 2, // hours
    overdueThreshold: 1 // hours before problem becomes overdue
  };
  
  // Update global sound setting
  soundEnabled = currentSettings.soundNotifications;
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
      <div class="p-6 overflow-y-auto flex-1 custom-scrollbar">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Nustatymai</h2>
          <button id="closeSettingsForm" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Automatinis pranešimų tikrinimas
            </label>
            <div class="flex items-center space-x-2">
              <input type="checkbox" id="autoNotifications" ${currentSettings.autoNotifications ? 'checked' : ''}
                     class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded">
              <span class="text-slate-900 dark:text-slate-100">Įjungti</span>
            </div>
          </div>
          
          <div>
            <label for="checkInterval" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tikrinimo intervalas (minutės)
            </label>
            <input type="number" id="checkInterval" value="${currentSettings.checkInterval}" min="5" max="120"
                   class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Garso pranešimai
            </label>
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <input type="checkbox" id="soundNotifications" ${currentSettings.soundNotifications ? 'checked' : ''}
                       class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded">
                <span class="text-slate-900 dark:text-slate-100">Įjungti</span>
              </div>
                <button type="button" id="testSoundsBtn" 
                        class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                  Testuoti garsus
                </button>
                <button type="button" id="testCriticalBtn" 
                        class="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors">
                  Testuoti kritinį
                </button>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Automatinis duomenų išsaugojimas
            </label>
            <div class="flex items-center space-x-2">
              <input type="checkbox" id="autoSave" ${currentSettings.autoSave ? 'checked' : ''}
                     class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-600 rounded">
              <span class="text-slate-900 dark:text-slate-100">Įjungti</span>
            </div>
          </div>
          
          <!-- Priority Settings -->
          <div class="border-t border-slate-200 dark:border-slate-600 pt-4">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Pranešimų prioritetai</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
              <strong>Prioritetas 0</strong> = 🚨 KRITINIS VĖLUOJAMA (automatiškai priskiriamas vėluojančioms problemoms)<br>
              <strong>Prioritetas 1-5</strong> = įprastiniai prioritetai (1 = aukščiausias, 5 = žemiausias)
            </p>
            
            <div class="space-y-3">
              <div class="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                <label class="text-sm font-medium text-red-800 dark:text-red-200">🚨 KRITINIS VĖLUOJAMA</label>
                <span class="text-xs text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-800 px-2 py-1 rounded">0</span>
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🛏️ Netvarkinga lova</label>
                <input type="number" id="priorityMessyBed" value="${currentSettings.priorityMessyBed || 1}" min="1" max="5"
                       class="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🧰 Trūksta priemonių</label>
                <input type="number" id="priorityMissingEquipment" value="${currentSettings.priorityMissingEquipment || 2}" min="1" max="5"
                       class="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">⚠️ Kita problema</label>
                <input type="number" id="priorityOtherProblem" value="${currentSettings.priorityOtherProblem || 3}" min="1" max="5"
                       class="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🧹 Ką tik atlaisvinta</label>
                <input type="number" id="priorityRecentlyFreed" value="${currentSettings.priorityRecentlyFreed || 4}" min="1" max="5"
                       class="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🔄 Reguliarus tikrinimas</label>
                <input type="number" id="priorityRegularCheck" value="${currentSettings.priorityRegularCheck || 5}" min="1" max="5"
                       class="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
            </div>
          </div>
          
          <!-- Time Thresholds -->
          <div class="border-t border-slate-200 dark:border-slate-600 pt-4">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Laiko ribos</h3>
            
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🚨 Vėlavimo laikotarpis (val.)</label>
                <input type="number" id="overdueThreshold" value="${currentSettings.overdueThreshold || 1}" min="0.1" max="24" step="0.1"
                       class="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🧹 Atlaisvinimo tikrinimas (val.)</label>
                <input type="number" id="recentlyFreedThreshold" value="${currentSettings.recentlyFreedThreshold || 1}" min="0.1" max="24" step="0.1"
                       class="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
              
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">🔄 Reguliarus tikrinimas (val.)</label>
                <input type="number" id="regularCheckThreshold" value="${currentSettings.regularCheckThreshold || 2}" min="0.5" max="24" step="0.5"
                       class="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center">
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex justify-end space-x-3 p-6 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 rounded-b-lg">
        <button type="button" id="cancelSettingsForm"
                class="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded-md transition-colors">
          Atšaukti
        </button>
        <button type="button" id="saveSettingsForm"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
          Išsaugoti
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close button handlers
  modal.querySelector('#closeSettingsForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Test sounds button handler
  modal.querySelector('#testSoundsBtn').addEventListener('click', () => {
    console.log('Testing notification sounds...');
    testNotificationSounds();
  });
  
  modal.querySelector('#testCriticalBtn').addEventListener('click', () => {
    console.log('Testing critical notification sound...');
    playCriticalNotificationSound();
  });
  
  modal.querySelector('#cancelSettingsForm').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Save button handler
  modal.querySelector('#saveSettingsForm').addEventListener('click', () => {
    const autoNotifications = modal.querySelector('#autoNotifications').checked;
    const checkInterval = modal.querySelector('#checkInterval').value;
    const soundNotifications = modal.querySelector('#soundNotifications').checked;
    const autoSave = modal.querySelector('#autoSave').checked;
    
    // Update global sound setting
    soundEnabled = soundNotifications;
    
    // Priority settings
    const priorityMessyBed = parseInt(modal.querySelector('#priorityMessyBed').value);
    const priorityMissingEquipment = parseInt(modal.querySelector('#priorityMissingEquipment').value);
    const priorityOtherProblem = parseInt(modal.querySelector('#priorityOtherProblem').value);
    const priorityRecentlyFreed = parseInt(modal.querySelector('#priorityRecentlyFreed').value);
    const priorityRegularCheck = parseInt(modal.querySelector('#priorityRegularCheck').value);
    
    // Time thresholds
    const recentlyFreedThreshold = parseFloat(modal.querySelector('#recentlyFreedThreshold').value);
    const regularCheckThreshold = parseFloat(modal.querySelector('#regularCheckThreshold').value);
    const overdueThreshold = parseFloat(modal.querySelector('#overdueThreshold').value);
    
    // Save settings to localStorage
    const settings = {
      autoNotifications,
      checkInterval: parseInt(checkInterval),
      soundNotifications,
      autoSave,
      // Priority settings
      priorityMessyBed,
      priorityMissingEquipment,
      priorityOtherProblem,
      priorityRecentlyFreed,
      priorityRegularCheck,
      // Time thresholds
      recentlyFreedThreshold,
      regularCheckThreshold,
      overdueThreshold
    };
    
    localStorage.setItem('bedManagementSettings', JSON.stringify(settings));
    
    console.log('Settings saved:', settings);
    alert('Nustatymai išsaugoti!');
    
    document.body.removeChild(modal);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  console.log('=== showSettingsModal END ===');
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing fixed app...');
  
  // Load saved settings
  const savedSettings = localStorage.getItem('bedManagementSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    console.log('Loaded settings:', settings);
  }
  
  // Setup event listeners
  const addStatusBtn = document.getElementById('addStatusBtn');
  if (addStatusBtn) {
    console.log('Found addStatusBtn');
    addStatusBtn.addEventListener('click', () => {
      console.log('Status button clicked');
      showStatusForm();
    });
  } else {
    console.log('addStatusBtn not found');
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
        renderNotifications();
        
        // Restore button
        refreshBtn.textContent = 'Atnaujinti';
        refreshBtn.disabled = false;
        
        console.log('Display refreshed');
      }, 500);
    });
  }
  
  console.log('Refresh button section completed');
  console.log('About to look for settingsBtn...');
  
  try {
    const settingsBtn = document.getElementById('settingsBtn');
    console.log('Looking for settingsBtn...');
    console.log('settingsBtn element:', settingsBtn);
    if (settingsBtn) {
      console.log('Found settingsBtn, adding event listener');
    settingsBtn.addEventListener('click', (e) => {
      console.log('Settings button clicked!');
      e.preventDefault();
      
      showSettingsModal();
    });
      console.log('Settings event listener added successfully');
    } else {
      console.log('settingsBtn not found');
    }

    // Font size button
    const fontSizeBtn = document.getElementById('fontSizeBtn');
    if (fontSizeBtn) {
      console.log('Found fontSizeBtn');
      fontSizeBtn.addEventListener('click', (e) => {
        console.log('Font size button clicked!');
        e.preventDefault();
        
        increaseFontSize();
      });
      console.log('Font size event listener added successfully');
    } else {
      console.log('fontSizeBtn not found');
    }

    // Font size down button
    const fontSizeDownBtn = document.getElementById('fontSizeDownBtn');
    if (fontSizeDownBtn) {
      console.log('Found fontSizeDownBtn');
      fontSizeDownBtn.addEventListener('click', (e) => {
        console.log('Font size down button clicked!');
        e.preventDefault();
        
        decreaseFontSize();
      });
      console.log('Font size down event listener added successfully');
    } else {
      console.log('fontSizeDownBtn not found');
    }
  } catch (error) {
    console.error('Error with settings button:', error);
  }
  
  console.log('Settings button section completed');
  
  
  // Search functionality
  const bedSearchInput = document.getElementById('bedSearch');
  if (bedSearchInput) {
    bedSearchInput.addEventListener('input', (e) => {
      filterBeds(e.target.value);
    });
  }
  
  // View toggle functionality
  const viewToggleBtn = document.getElementById('viewToggle');
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', toggleView);
  }
  
          // Initialize font size setting
          initializeFontSize();
          
          // Load sound settings
          const soundSettings = localStorage.getItem('bedManagementSettings');
          if (soundSettings) {
            const settings = JSON.parse(soundSettings);
            soundEnabled = settings.soundNotifications !== false; // Default to true if not set
          }
          
          // Initial render
          renderBedGrid();
          renderKPIs();
          renderNotifications();
          
          // Load workers data first (only once)
          console.log('Loading workers data on startup...');
          loadWorkersData().then(() => {
            // Then load other CSV data
            console.log('Loading CSV data on startup...');
            updateBedDataFromCSV().catch(error => {
              console.error('Failed to load CSV data on startup:', error);
            });
          }).catch(error => {
            console.error('Failed to load workers data on startup:', error);
          });
  
  // Set up automatic refresh every 60 seconds (1 minute)
  console.log('Setting up automatic refresh every 60 seconds...');
  setInterval(() => {
    console.log('Auto-refreshing data...');
    updateBedDataFromCSV().catch(error => {
      console.error('Failed to auto-refresh CSV data:', error);
    });
  }, 60000); // 60 seconds (1 minute)
  
  // Also refresh when page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('Page became visible, refreshing data...');
      updateBedDataFromCSV().catch(error => {
        console.error('Failed to refresh data on visibility change:', error);
      });
    }
  });
  
  console.log('Fixed app initialized successfully!');
});
