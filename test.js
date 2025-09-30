// Simple test to check if modules are loading
console.log('Test script loaded');

// Test if we can access the modules
try {
  console.log('Testing module imports...');
  
  // Test basic DOM access
  const testElement = document.getElementById('addStatusBtn');
  console.log('Found addStatusBtn:', testElement);
  
  // Test if we can add event listeners
  if (testElement) {
    testElement.addEventListener('click', () => {
      console.log('Button clicked!');
      alert('Button works!');
    });
    console.log('Event listener added successfully');
  }
  
} catch (error) {
  console.error('Error in test script:', error);
}
