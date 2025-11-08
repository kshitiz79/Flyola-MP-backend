const { format, toZonedTime } = require('date-fns-tz');
const { Op } = require('sequelize');
const getModels = () => require('../model');
const validateIdsExist = require('../utils/validateIdsExist');

function getRouteAirports({ start_airport_id, end_airport_id, airport_stop_ids }) {
  let stopsRaw = [];
  try {
    stopsRaw = Array.isArray(airport_stop_ids)
      ? airport_stop_ids
      : JSON.parse(airport_stop_ids || '[]');
  } catch {
    stopsRaw = [];
  }

  const cleaned = [];
  const seen = new Set([start_airport_id, end_airport_id]);

  for (const id of stopsRaw) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    cleaned.push(id);
    seen.add(id);
    
  }

  return [start_airport_id, ...cleaned, end_airport_id];
}
exports.getRouteAirports = getRouteAirports;

async function validateFlightBody(body, isUpdate = false, flightId = null) {
  const { flight_number, start_airport_id, end_airport_id, airport_stop_ids = [], seat_limit, departure_day } = body;

  // Validate start and end airport IDs
  if (!Number.isInteger(start_airport_id) || start_airport_id <= 0) {
    throw new Error('start_airport_id must be a positive integer');
  }
  if (!Number.isInteger(end_airport_id) || end_airport_id <= 0) {
    throw new Error('end_airport_id must be a positive integer');
  }

  // Initialize stops safely
  let stops;
  try {
    stops = Array.isArray(airport_stop_ids) ? airport_stop_ids : JSON.parse(airport_stop_ids || '[]');
    stops = [...new Set(stops.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  } catch (e) {
    stops = [];
  }

  // Validation checks
  if (!isUpdate) {
    if (!flight_number || !flight_number.trim()) throw new Error('flight_number is required');
    if (!departure_day) throw new Error('departure_day is required');
  }

  // Allow same start and end airports only if there are stops
  if (start_airport_id === end_airport_id && stops.length === 0) {
    throw new Error('For flights starting and ending at the same airport, there must be at least one stop');
  }

  // Validate stops
  if (stops.includes(start_airport_id) || stops.includes(end_airport_id)) {
    throw new Error('Stops cannot include start or end airports');
  }

  // Validate airport IDs exist
  const airportIdsToCheck = [...new Set([...stops, start_airport_id, end_airport_id])].filter(id => id);
  if (airportIdsToCheck.length === 0) {
    throw new Error('No valid airport IDs provided');
  }
  try {
    await validateIdsExist(getModels().Airport, airportIdsToCheck);
  } catch (err) {
    throw err;
  }

  // Check for duplicate flight number
  if (flight_number) {
    const dup = await getModels().Flight.findOne({
      where: {
        flight_number,
        ...(isUpdate && flightId && { id: { [Op.ne]: flightId } }),
      },
    });
    if (dup) throw new Error(`flight_number ${flight_number} already exists`);
  }

  // Validate seat limit
  if (seat_limit !== undefined && (!Number.isInteger(seat_limit) || seat_limit < 1)) {
    throw new Error('seat_limit must be a positive integer');
  }

  // Validate departure day
  const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (departure_day && !validDays.includes(departure_day)) {
    throw new Error('departure_day must be a valid day');
  }

  return { ...body, airport_stop_ids: stops };
}
function getNextWeekday(weekday) {
  const map = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const now = toZonedTime(new Date(), 'Asia/Kolkata');
  const diff = (map[weekday] - now.getDay() + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + diff);
  return toZonedTime(next, 'Asia/Kolkata');
}

function combineDateAndTime(dateObj, timeString = '00:00:00') {
  const dateStr = format(dateObj, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
  return toZonedTime(new Date(`${dateStr}T${timeString}+05:30`), 'Asia/Kolkata');
}

async function updateFlightStatuses() {
  const models = getModels();
  const now = toZonedTime(new Date(), 'Asia/Kolkata');
  const flights = await models.Flight.findAll();

  for (const flight of flights) {
    const datePart = getNextWeekday(flight.departure_day);
    const flightDateTime = combineDateAndTime(datePart, flight.departure_time);
    if (flightDateTime < now && flight.status === 0) {
      await flight.update({ status: 1 });
    }
  }
}
setInterval(updateFlightStatuses, 10 * 60 * 1000);

exports.getFlights = async (req, res) => {
  try {
    await updateFlightStatuses();
    const where = req.query.user === 'true' ? { status: 1 } : {};
    const flights = await getModels().Flight.findAll({ where });
    res.json(flights);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addFlight = async (req, res) => {
  try {
    const validatedBody = await validateFlightBody(req.body);
    const newFlight = await getModels().Flight.create({
      ...validatedBody,
      airport_stop_ids: validatedBody.airport_stop_ids,
    });
    res.status(201).json({ id: newFlight.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateFlight = async (req, res) => {
  try {
    const flight = await getModels().Flight.findByPk(req.params.id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });

    const validatedBody = await validateFlightBody(req.body, true, flight.id);
    await flight.update({ ...validatedBody, airport_stop_ids: validatedBody.airport_stop_ids });
    res.json({ flight });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteFlight = async (req, res) => {
  try {
    const flight = await getModels().Flight.findByPk(req.params.id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    await flight.destroy();
    res.json({ message: 'Flight deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.activateAllFlights = async (req, res) => {
  try {
    await getModels().Flight.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flights activated' });
  } catch (err) {
    res.status(500).json({ error: 'Activation failed' });
  }
};

exports.editAllFlights = async (req, res) => {
  const limit = parseInt(req.body.seat_limit, 10);
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'Invalid seat_limit' });
  }
  try {
    await getModels().Flight.update({ seat_limit: limit }, { where: {} });
    res.json({ message: 'All flights updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
};

exports.deleteAllFlights = async (req, res) => {
  try {
    await getModels().Flight.destroy({ where: {} });
    res.json({ message: 'All flights deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
};