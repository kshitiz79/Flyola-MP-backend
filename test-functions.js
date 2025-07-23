const { getRouteAirports } = require('./src/controller/flightController');
const { sumSeats, getAvailableSeats } = require('./src/utils/seatUtils');

console.log('Testing getRouteAirports function...');
try {
  const route = getRouteAirports({
    start_airport_id: 1,
    end_airport_id: 2,
    airport_stop_ids: []
  });
  console.log('✅ getRouteAirports works:', route);
} catch (error) {
  console.error('❌ getRouteAirports error:', error.message);
}

console.log('Testing sumSeats function...');
try {
  // This will fail because we need database connection, but let's see if the function is accessible
  console.log('✅ sumSeats function is accessible:', typeof sumSeats);
} catch (error) {
  console.error('❌ sumSeats error:', error.message);
}

console.log('Testing getAvailableSeats function...');
try {
  console.log('✅ getAvailableSeats function is accessible:', typeof getAvailableSeats);
} catch (error) {
  console.error('❌ getAvailableSeats error:', error.message);
}