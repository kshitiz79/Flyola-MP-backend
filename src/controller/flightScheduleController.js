
const { format, toZonedTime } = require('date-fns-tz');
const { Op } = require('sequelize');
const getModels = () => require('../model'); // Lazy-load models

async function seatsLeft(models, schedule_id, bookDate) {
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule || !schedule.Flight) return 0;

  const flight = schedule.Flight;
  const routeAirports = flight.airport_stop_ids
    ? JSON.parse(flight.airport_stop_ids)
    : [flight.start_airport_id, flight.end_airport_id];

  // Get the segment's start and end indices in the route
  const segmentStartIndex = routeAirports.indexOf(schedule.departure_airport_id);
  const segmentEndIndex = routeAirports.indexOf(schedule.arrival_airport_id);

  // Find all schedules that overlap with this segment
  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
  });
  const overlappingSchedules = allSchedules.filter((s) => {
    const startIndex = routeAirports.indexOf(s.departure_airport_id);
    const endIndex = routeAirports.indexOf(s.arrival_airport_id);
    return startIndex <= segmentStartIndex && endIndex >= segmentEndIndex;
  });

  // Sum booked seats across all overlapping schedules
  let totalBooked = 0;
  for (const s of overlappingSchedules) {
    const booked = await models.BookedSeat.sum('booked_seat', {
      where: { schedule_id: s.id, bookDate },
      transaction: null, // Use transaction if called within one
    });
    totalBooked += booked || 0;
  }

  return Math.max(0, flight.seat_limit - totalBooked);
}

async function getFlightSchedules(req, res) {
  const models = getModels();
  const isUserRequest = req.query.user === 'true';
  const monthQuery = req.query.month; // e.g., "2025-04"

  try {
    const where = isUserRequest ? { status: 1 } : {};
    const rows = await models.FlightSchedule.findAll({
      where,
      include: [{ model: models.Flight }],
    });

    let output = [];
    if (monthQuery) {
      const [year, month] = monthQuery.split("-").map(Number);
      const startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata'); // Last day of the month

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
        const weekday = format(d, 'EEEE', { timeZone: 'Asia/Kolkata' });

        for (const r of rows) {
          const flight = r.Flight;
          if (flight.departure_day === weekday) {
            let viaStopIds = [];
            try {
              viaStopIds = r.via_stop_id ? JSON.parse(r.via_stop_id) : [];
              viaStopIds = viaStopIds.filter(id => id && Number.isInteger(id) && id !== 0);
            } catch (e) {
              console.warn(`Invalid via_stop_id in schedule ${r.id}:`, r.via_stop_id);
            }

            output.push({
              ...r.toJSON(),
              via_stop_id: JSON.stringify(viaStopIds),
              departure_date: currentDate,
              availableSeats: await seatsLeft(models, r.id, currentDate),
            });
          }
        }
      }
    } else {
      const bookDate = req.query.date || format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      output = await Promise.all(
        rows.map(async (r) => {
          let viaStopIds = [];
          try {
            viaStopIds = r.via_stop_id ? JSON.parse(r.via_stop_id) : [];
            viaStopIds = viaStopIds.filter(id => id && Number.isInteger(id) && id !== 0);
          } catch (e) {
            console.warn(`Invalid via_stop_id in schedule ${r.id}:`, r.via_stop_id);
          }
          return {
            ...r.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date: bookDate,
            availableSeats: await seatsLeft(models, r.id, bookDate),
          };
        })
      );
    }

    console.log('getFlightSchedules - output:', output);
    res.json(output);
  } catch (err) {
    console.error('getFlightSchedules:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
}

async function addFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, ...body } = req.body;
  try {
    let validViaStopIds = [];
    if (via_stop_id) {
      validViaStopIds = JSON.parse(via_stop_id).filter(id => id && Number.isInteger(id) && id !== 0);
    }
    const row = await models.FlightSchedule.create({
      ...body,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error('addFlightSchedule:', err);
    res.status(500).json({ error: 'Failed to add flight schedule' });
  }
}

async function updateFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, ...body } = req.body;
  try {
    const row = await models.FlightSchedule.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    let validViaStopIds = [];
    if (via_stop_id) {
      validViaStopIds = JSON.parse(via_stop_id).filter(id => id && Number.isInteger(id) && id !== 0);
    }
    await row.update({
      ...body,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('updateFlightSchedule:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
}

async function deleteFlightSchedule(req, res) {
  const models = getModels();
  try {
    const row = await models.FlightSchedule.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await row.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteFlightSchedule:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

async function activateAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flight schedules activated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to activate all' });
  }
}

async function editAllFlightSchedules(req, res) {
  const models = getModels();
  const { price } = req.body;
  if (!price || isNaN(price))
    return res.status(400).json({ error: 'Invalid price' });
  try {
    await models.FlightSchedule.update(
      { price: parseFloat(price) },
      { where: {} }
    );
    res.json({ message: 'All flight schedules updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update all' });
  }
}

async function deleteAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.destroy({ where: {} });
    res.json({ message: 'All flight schedules deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete all' });
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
};
