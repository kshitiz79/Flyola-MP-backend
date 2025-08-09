const fetch = require('node-fetch');

async function testBookings() {
  const baseUrl = 'http://localhost:4000';
  
  try {
    console.log('=== Testing Bookings API ===');
    
    // Test bookings endpoint
    console.log('1. Testing bookings endpoint...');
    const response = await fetch(`${baseUrl}/bookings?status=Confirmed`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Success! Found', data.length, 'bookings');
    
    if (data.length > 0) {
      console.log('Sample booking structure:');
      console.log(JSON.stringify(data[0], null, 2));
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testBookings();