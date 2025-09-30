// Simplified app without modules for testing
console.log('Simplified app starting...');

// Test basic functionality
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  
  // Test button clicks
  const addStatusBtn = document.getElementById('addStatusBtn');
  if (addStatusBtn) {
    console.log('Found addStatusBtn');
    addStatusBtn.addEventListener('click', () => {
      console.log('Add status button clicked');
      alert('Add status button works!');
    });
  } else {
    console.log('addStatusBtn not found');
  }
  
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    console.log('Found settingsBtn');
    settingsBtn.addEventListener('click', () => {
      console.log('Settings button clicked');
      alert('Settings button works!');
    });
  } else {
    console.log('settingsBtn not found');
  }
  
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    console.log('Found refreshBtn');
    refreshBtn.addEventListener('click', () => {
      console.log('Refresh button clicked');
      alert('Refresh button works!');
    });
  } else {
    console.log('refreshBtn not found');
  }
  
  // Test theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    console.log('Found themeToggle');
    themeToggle.addEventListener('click', () => {
      console.log('Theme toggle clicked');
      document.documentElement.classList.toggle('dark');
      alert('Theme toggle works!');
    });
  } else {
    console.log('themeToggle not found');
  }
  
  console.log('All event listeners set up');
});
