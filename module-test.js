// Test direct module import
console.log('Testing direct module import...');

// Test if we can import the bedData module directly
import('./models/bedData.js')
  .then(module => {
    console.log('Successfully imported bedData module:', module);
    console.log('BED_LAYOUT:', module.BED_LAYOUT);
    console.log('STATUS_OPTIONS:', module.STATUS_OPTIONS);
  })
  .catch(error => {
    console.error('Failed to import bedData module:', error);
  });

// Test if we can import the settings module
import('./settings/settingsManager.js')
  .then(module => {
    console.log('Successfully imported settingsManager module:', module);
  })
  .catch(error => {
    console.error('Failed to import settingsManager module:', error);
  });
