const getModels = () => require('../src/model');
const { getRouteAirports } = require('../src/controller/flightController');

async function fixFlightSchedules() {
  const models = getModels();

  try {
    console.log('🔧 Starting flight schedule validation fix...');

    // Get all flight schedules with their flights
    const schedules = await models.FlightSchedule.findAll({
      include: [{ model: models.Flight }]
    });

    console.log(`📊 Found ${schedules.length} flight schedules to validate`);

    let fixedCount = 0;
    let invalidCount = 0;

    for (const schedule of schedules) {
      const flight = schedule.Flight;
      if (!flight) {
        console.warn(`⚠️  Schedule ${schedule.id} has no associated flight`);
        continue;
      }

      // Get the route for this flight
      const route = getRouteAirports({
        start_airport_id: flight.start_airport_id,
        end_airport_id: flight.end_airport_id,
        airport_stop_ids: flight.airport_stop_ids,
      });

      const depIdx = route.indexOf(schedule.departure_airport_id);
      const arrIdx = route.lastIndexOf(schedule.arrival_airport_id);

      if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
        console.warn(`❌ Invalid schedule ${schedule.id}: departure=${schedule.departure_airport_id}, arrival=${schedule.arrival_airport_id}, route=${JSON.stringify(route)}`);

        // Try to fix by using the first and last airports in the route
        if (route.length >= 2) {
          const newDeparture = route[0];
          const newArrival = route[route.length - 1];

          await schedule.update({
            departure_airport_id: newDeparture,
            arrival_airport_id: newArrival
          });

          console.log(`✅ Fixed schedule ${schedule.id}: ${newDeparture} → ${newArrival}`);
          fixedCount++;
        } else {
          console.error(`❌ Cannot fix schedule ${schedule.id}: invalid route`);
          invalidCount++;
        }
      } else {
        console.log(`✅ Schedule ${schedule.id} is valid`);
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Fixed: ${fixedCount} schedules`);
    console.log(`   ❌ Invalid: ${invalidCount} schedules`);
    console.log(`   ✅ Total processed: ${schedules.length} schedules`);

  } catch (error) {
    console.error('❌ Error fixing flight schedules:', error);
  }
}

// Run the fix if this file is executed directly
if (require.main === module) {
  fixFlightSchedules()
    .then(() => {
      console.log('🎉 Flight schedule fix completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Flight schedule fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixFlightSchedules };