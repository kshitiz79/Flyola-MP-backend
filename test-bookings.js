const fetch = require('node-fetch');

async function testBookings() {
  const baseUrl = 'https://api.jetserveaviation.com       ';

  try {

    // Test bookings endpoint
    const response = await fetch(`${baseUrl}/bookings?status=Confirmed`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });


    if (!response.ok) {
      const errorText = await response.text();
      return;
    }

    const data = await response.json();

    if (data.length > 0) {
    }

  } catch (error) {
  }
}

testBookings();