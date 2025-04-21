// controller/flightController.js
const { format, toZonedTime } = require('date-fns-tz');
const { Op } = require('sequelize');
const getModels = () => require('../model');
const validateIdsExist = require('../utils/validateIdsExist');

/**
 * Return the full airport chain for a flight: [start, ...stops..., end]
 * @param {Object} flight - Flight object with start_airport_id, end_airport_id, airport_stop_ids
 * @returns {number[]} Array of airport IDs
 */
function getRouteAirports({ start_airport_id, end_airport_id, airport_stop_ids }) {
  let stopsRaw = [];
  try {
    stopsRaw = Array.isArray(airport_stop_ids)
      ? airport_stop_ids
      : JSON.parse(airport_stop_ids || '[]');
  } catch {
    /* corrupt JSON → ignore stops */
    stopsRaw = [];
  }

  const cleaned = [];
  const seen    = new Set([start_airport_id, end_airport_id]);   // never include start/end twice
  for (const id of stopsRaw) {
    if (!Number.isInteger(id) || id <= 0) continue;              // skip invalid
    if (seen.has(id))               continue;                    // skip duplicates / start / end
    cleaned.push(id);
    seen.add(id);
  }

  return [start_airport_id, ...cleaned, end_airport_id];
}
exports.getRouteAirports = getRouteAirports;
/** ---------- VALIDATION ---------- */
async function validateFlightBody(body, isUpdate = false, flightId = null) {
  const {
    flight_number,
    start_airport_id,
    end_airport_id,
    airport_stop_ids = [],
    seat_limit,
    departure_day,
    status,
  } = body;

  if (!isUpdate) {
    if (!flight_number) throw new Error('flight_number is required');
    if (!start_airport_id || !end_airport_id) throw new Error('start_airport_id & end_airport_id are required');
    if (!departure_day) throw new Error('departure_day is required');
  }
  if (start_airport_id === end_airport_id) {
    throw new Error('start_airport_id and end_airport_id must differ');
  }

  const stops = Array.isArray(airport_stop_ids) ? airport_stop_ids : JSON.parse(airport_stop_ids || '[]');

  // Validate IDs
  const badId = stops.find(id => !Number.isInteger(id) || id <= 0);
  if (badId) throw new Error(`Invalid stop id: ${badId}`);
  if (new Set(stops).size !== stops.length) {
    throw new Error('airport_stop_ids contains duplicates');
  }
  if (stops.includes(start_airport_id) || stops.includes(end_airport_id)) {
    throw new Error('Stops cannot include start or end airport');
  }

  // Check airport existence
  await validateIdsExist(getModels().Airport, [...stops, start_airport_id, end_airport_id]);

  // Check flight_number uniqueness
  if (flight_number) {
    const dup = await getModels().Flight.findOne({
      where: {
        flight_number,
        ...(isUpdate && { id: { [Op.ne]: flightId } }),
      },
    });
    if (dup) throw new Error(`flight_number ${flight_number} already exists`);
  }

  // Validate seat_limit
  if (seat_limit !== undefined && (!Number.isInteger(seat_limit) || seat_limit < 1)) {
    throw new Error('seat_limit must be a positive integer');
  }

  // Validate departure_day
  const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (departure_day && !validDays.includes(departure_day)) {
    throw new Error('departure_day must be a valid day of the week');
  }

  return { stops };
}

/** ---------- HELPER FUNCTIONS ---------- */
function getNextWeekday(weekday) {
  const weekdayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  const now = toZonedTime(new Date(), 'Asia/Kolkata');
  const currentDay = now.getDay();
  const targetDay = weekdayMap[weekday];
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) daysToAdd += 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysToAdd);
  return toZonedTime(nextDate, 'Asia/Kolkata');
}

function combineDateAndTime(dateObj, timeString) {
  const [hours, minutes, seconds] = (timeString || '00:00:00').split(':').map(Number);
  const dateStr = format(dateObj, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
  const combined = new Date(`${dateStr}T${timeString || '00:00:00'}+05:30`);
  return toZonedTime(combined, 'Asia/Kolkata');
}

async function updateFlightStatuses() {
  const models = getModels();
  try {
    const now = toZonedTime(new Date(), 'Asia/Kolkata');
    const flights = await models.Flight.findAll();
    for (const flight of flights) {
      const datePart = getNextWeekday(flight.departure_day);
      const flightDateTime = combineDateAndTime(datePart, flight.departure_time);
      if (flightDateTime < now && flight.status === 0) {
        await flight.update({ status: 1 });
      }
    }
  } catch (err) {
    console.error('Error updating flight statuses:', err);
  }
}

// Run every 10 minutes
setInterval(updateFlightStatuses, 10 * 60 * 1000);

/** ---------- CONTROLLERS ---------- */
exports.getFlights = async (req, res) => {
  const models = getModels();
  try {
    await updateFlightStatuses();
    const isUserRequest = req.query.user === 'true';
    const whereClause = isUserRequest ? { status: 1 } : {};
    const flights = await models.Flight.findAll({ where: whereClause });
    res.json(flights);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addFlight = async (req, res) => {
  const models = getModels();
  try {
    const { stops } = await validateFlightBody(req.body);
    const newFlight = await models.Flight.create({
      ...req.body,
      airport_stop_ids: stops, // Store as array
    });
    res.status(201).json({ message: 'Flight added successfully', id: newFlight.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateFlight = async (req, res) => {
  const models = getModels();
  try {
    const flight = await models.Flight.findByPk(req.params.id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });

    const { stops } = await validateFlightBody(req.body, true, flight.id);
    await flight.update({ ...req.body, airport_stop_ids: stops });

    res.json({ message: 'Flight updated successfully', flight });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteFlight = async (req, res) => {
  const models = getModels();
  try {
    const flight = await models.Flight.findByPk(req.params.id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    await flight.destroy();
    res.json({ message: 'Flight deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete flight: ${err.message}` });
  }
};

exports.activateAllFlights = async (req, res) => {
  const models = getModels();
  try {
    await models.Flight.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flights activated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate all flights' });
  }
};

exports.editAllFlights = async (req, res) => {
  const models = getModels();
  const { seat_limit } = req.body;
  if (!seat_limit || isNaN(seat_limit) || seat_limit < 1) {
    return res.status(400).json({ error: 'Invalid seat limit value' });
  }
  try {
    await models.Flight.update({ seat_limit: parseInt(seat_limit) }, { where: {} });
    res.json({ message: 'All flights updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit all flights' });
  }
};

exports.deleteAllFlights = async (req, res) => {
  const models = getModels();
  try {
    await models.Flight.destroy({ where: {} });
    res.json({ message: 'All flights deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all flights' });
  }
};