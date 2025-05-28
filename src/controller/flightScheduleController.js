const { format, toZonedTime } = require('date-fns-tz');
const { getAvailableSeats } = require('../utils/seatUtils');
const getModels = () => require('../model');

async function getFlightSchedules(req, res) {
  const models = getModels();
  const isUserRequest = req.query.user === 'true';
  const monthQuery = req.query.month;
  try {
    const where = isUserRequest ? { status: 1 } : {};
    const rows = await models.FlightSchedule.findAll({
      where,
      include: [{ model: models.Flight }],
    });

    let output = [];
    if (monthQuery) {
      const [year, month] = monthQuery.split('-').map(Number);
      const startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const departure_date = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
        const weekday = format(d, 'EEEE', { timeZone: 'Asia/Kolkata' });

        for (const schedule of rows) {
          const flight = schedule.Flight;
          if (!flight || flight.departure_day !== weekday) continue;

          let viaStopIds = [];
          try {
            viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
            viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
          } catch (e) {
            console.error(`Error parsing via_stop_id for schedule ${schedule.id}:`, e);
          }

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableSeats({
              models,
              schedule_id: schedule.id,
              bookDate: departure_date,
              transaction: null,
            });
            availableSeats = seats.length;
          } catch (error) {
            console.warn(`Failed to get available seats for schedule ${schedule.id}:`, error.message);
            seatError = error.message;
          }

          output.push({
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date,
            availableSeats,
            seatError: seatError || undefined, // Include error if present
          });
        }
      }
    } else {
      const bookDate = req.query.date || format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      const results = await Promise.all(
        rows.map(async (schedule) => {
          const flight = schedule.Flight;
          if (!flight) {
            console.warn(`No flight found for schedule ${schedule.id}`);
            return null;
          }

          let viaStopIds = [];
          try {
            viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
            viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
          } catch (e) {
            console.error(`Error parsing via_stop_id for schedule ${schedule.id}:`, e);
          }

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableSeats({
              models,
              schedule_id: schedule.id,
              bookDate,
              transaction: null,
            });
            availableSeats = seats.length;
          } catch (error) {
            console.warn(`Failed to get available seats for schedule ${schedule.id}:`, error.message);
            seatError = error.message;
          }

          return {
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date: bookDate,
            availableSeats,
            seatError: seatError || undefined,
          };
        })
      );
      output = results.filter((item) => item);
    }

    res.json(output);
  } catch (err) {
    console.error('getFlightSchedules error:', err);
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
}

async function addFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_airport_id, arrival_airport_id, flight_id, ...body } = req.body;
  try {
    // Validate departure and arrival airports
    const flight = await models.Flight.findByPk(flight_id);
    if (!flight) {
      return res.status(400).json({ error: 'Flight not found' });
    }
    const route = getRoute(flight);
    if (!route.includes(departure_airport_id) || !route.includes(arrival_airport_id)) {
      return res.status(400).json({ error: 'Invalid departure or arrival airport' });
    }
    if (route.indexOf(departure_airport_id) >= route.indexOf(arrival_airport_id)) {
      return res.status(400).json({ error: 'Departure must precede arrival in flight route' });
    }

    const validViaStopIds = via_stop_id
      ? JSON.parse(via_stop_id).filter((id) => id && Number.isInteger(id) && id !== 0)
      : [];

    const schedule = await models.FlightSchedule.create({
      ...body,
      departure_airport_id,
      arrival_airport_id,
      flight_id,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.status(201).json({ id: schedule.id });
  } catch (err) {
    console.error('addFlightSchedule error:', err);
    res.status(500).json({ error: 'Failed to add flight schedule' });
  }
}

async function updateFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_airport_id, arrival_airport_id, flight_id, ...body } = req.body;
  try {
    const schedule = await models.FlightSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });

    // Validate departure and arrival airports if provided
    if (departure_airport_id || arrival_airport_id || flight_id) {
      const targetFlightId = flight_id || schedule.flight_id;
      const flight = await models.Flight.findByPk(targetFlightId);
      if (!flight) {
        return res.status(400).json({ error: 'Flight not found' });
      }
      const route = getRoute(flight);
      const depId = departure_airport_id || schedule.departure_airport_id;
      const arrId = arrival_airport_id || schedule.arrival_airport_id;
      if (route.length > 0) { // Only validate if route exists
        if (!route.includes(depId) || !route.includes(arrId)) {
          return res.status(400).json({ error: 'Invalid departure or arrival airport' });
        }
        if (route.indexOf(depId) >= route.indexOf(arrId)) {
          return res.status(400).json({ error: 'Departure must precede arrival in flight route' });
        }
      }
    }

    // Validate via_stop_id
    let validViaStopIds = [];
    if (via_stop_id) {
      try {
        validViaStopIds = JSON.parse(via_stop_id).filter(
          (id) => id && Number.isInteger(id) && id !== 0
        );
        // Optionally validate via_stop_ids against airports table
        const airports = await models.Airport.findAll({
          where: { id: validViaStopIds },
          attributes: ['id'],
        });
        const validAirportIds = airports.map((a) => a.id);
        validViaStopIds = validViaStopIds.filter((id) => validAirportIds.includes(id));
      } catch (e) {
        console.error(`Error parsing via_stop_id for schedule ${req.params.id}:`, e);
        return res.status(400).json({ error: 'Invalid via_stop_id format' });
      }
    } else {
      validViaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
    }

    await schedule.update({
      ...body,
      departure_airport_id: departure_airport_id || schedule.departure_airport_id,
      arrival_airport_id: arrival_airport_id || schedule.arrival_airport_id,
      flight_id: flight_id || schedule.flight_id,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('updateFlightSchedule error:', err);
    res.status(500).json({ error: 'Failed to update', details: err.message });
  }
}
async function deleteFlightSchedule(req, res) {
  const models = getModels();
  try {
    const schedule = await models.FlightSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    await schedule.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteFlightSchedule error:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

async function activateAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flight schedules activated' });
  } catch (err) {
    console.error('activateAllFlightSchedules error:', err);
    res.status(500).json({ error: 'Failed to activate all' });
  }
}

async function editAllFlightSchedules(req, res) {
  const models = getModels();
  const { price } = req.body;
  if (!price || isNaN(price)) return res.status(400).json({ error: 'Invalid price' });
  try {
    await models.FlightSchedule.update(
      { price: parseFloat(price) },
      { where: {} }
    );
    res.json({ message: 'All flight schedules updated' });
  } catch (err) {
    console.error('editAllFlightSchedules error:', err);
    res.status(500).json({ error: 'Failed to update all' });
  }
}

async function deleteAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.destroy({ where: {} });
    res.json({ message: 'All flight schedules deleted' });
  } catch (err) {
    console.error('deleteAllFlightSchedules error:', err);
    res.status(500).json({ error: 'Failed to delete all' });
  }
}

async function updateFlightStops(req, res) {
  const models = getModels();
  const { flight_id, airport_stop_ids } = req.body;
  try {
    const flight = await models.Flight.findByPk(flight_id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    await flight.update({ airport_stop_ids: JSON.stringify(airport_stop_ids) });
    res.json({ message: 'Flight stops updated' });
  } catch (err) {
    console.error('updateFlightStops error:', err);
    res.status(500).json({ error: 'Failed to update flight stops' });
  }
}






async function getSchedulePriceByDay(req, res) {
  const models = getModels();
  const scheduleId = req.query.schedule_id || req.params.id;
  const monthQuery = req.query.month; // e.g. "2025-05"

  if (!scheduleId) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }

  try {
    const schedule = await models.FlightSchedule.findByPk(scheduleId, {
      include: [{ model: models.Flight }],
    });

    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!schedule.Flight) return res.status(404).json({ error: 'Associated Flight not found' });

    const price = parseFloat(schedule.price);
    const departureDay = schedule.Flight.departure_day; 
    if (!departureDay) {
      return res.status(400).json({ error: 'Flight departure day not defined' });
    }

    // Determine year and month
    let year, month;
    if (monthQuery) {
      [year, month] = monthQuery.split('-').map(Number);
    } else {
      const now = toZonedTime(new Date(), 'Asia/Kolkata');
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
    const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');

    // Map weekday string to number (0 = Sunday ... 6 = Saturday)
    const weekdayMap = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    const targetWeekday = weekdayMap[departureDay];
    if (targetWeekday === undefined) {
      return res.status(400).json({ error: 'Invalid flight departure day' });
    }

    const output = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === targetWeekday) {
        const dateStr = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
        output.push({ date: dateStr, price });
      }
    }

    res.json(output);
  } catch (err) {
    console.error('getSchedulePriceByDay error:', err);
    res.status(500).json({ error: 'Failed to get prices by day' });
  }
}



module.exports = {
  getFlightSchedules,
  addFlightSchedule,
  updateFlightSchedule,
  deleteFlightSchedule,
  activateAllFlightSchedules,     
  editAllFlightSchedules,
  deleteAllFlightSchedules,
  updateFlightStops,
   getSchedulePriceByDay,
};