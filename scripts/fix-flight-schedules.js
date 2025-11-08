const getModels = () => require('../src/model');
const { getRouteAirports } = require('../src/controller/flightController');

async function fixFlightSchedules() {
  const models = getModels();

  try {

    // Get all flight schedules with their flights
    const schedules = await models.FlightSchedule.findAll({
      include: [{ model: models.Flight }]
    });


    let fixedCount = 0;
    let invalidCount = 0;

    for (const schedule of schedules) {
      const flight = schedule.Flight;
      if (!flight) {
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

        // Try to fix by using the first and last airports in the route
        if (route.length >= 2) {
          const newDeparture = route[0];
          const newArrival = route[route.length - 1];

          await schedule.update({
            departure_airport_id: newDeparture,
            arrival_airport_id: newArrival
          });

          fixedCount++;
        } else {
          invalidCount++;
        }
      } else {
      }
    }


  } catch (error) {
  }
}

// Run the fix if this file is executed directly
if (require.main === module) {
  fixFlightSchedules()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

module.exports = { fixFlightSchedules };