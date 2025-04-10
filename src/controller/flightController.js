const Flight = require('./../model/flight');

// Utility functions
function getNextWeekday(weekday) {
  const weekdayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2,
    Wednesday: 3, Thursday: 4,
    Friday: 5, Saturday: 6,
  };
  const now = new Date();
  const currentDay = now.getDay();
  const targetDay = weekdayMap[weekday];
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysToAdd);
  return nextDate;
}

function combineDateAndTime(dateObj, timeString) {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  const combined = new Date(dateObj);
  combined.setHours(hours, minutes, seconds || 0, 0);
  return combined;
}

// Update flight statuses (unchanged)
async function updateFlightStatuses() {
  try {
    const now = new Date();
    const flights = await Flight.findAll();
    for (const flight of flights) {
      const datePart = getNextWeekday(flight.departure_day);
      const flightDateTime = combineDateAndTime(datePart, flight.departure_time || "00:00:00");
      if (flightDateTime < now && flight.status === 0) {
        await flight.update({ status: 1 });
      }
    }
  } catch (err) {
    console.error('Error updating flight statuses:', err);
  }
}

setInterval(updateFlightStatuses, 10 * 60 * 1000);

// Get all flights (filtered for active flights for user-facing requests)
const getFlights = async (req, res) => {
  try {
    await updateFlightStatuses(); // Update statuses before fetching
    const isUserRequest = req.query.user === 'true'; // Example: Add ?user=true for user requests
    const whereClause = isUserRequest ? { status: 1 } : {}; // Only active flights for users
    const flights = await Flight.findAll({ where: whereClause });
    res.json(flights);
  } catch (err) {
    console.error('Error fetching flights:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add a new flight
const addFlight = async (req, res) => {
  const { flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status } = req.body;

  try {
    const newFlight = await Flight.create({
      flight_number,
      departure_day,
      start_airport_id,
      end_airport_id,
      airport_stop_ids,
      seat_limit,
      status,
    });
    res.status(201).json({ message: 'Flight added successfully', id: newFlight.id });
  } catch (err) {
    console.error('Error adding flight:', err);
    res.status(500).json({ error: 'Failed to add flight' });
  }
};

// Update a flight
const updateFlight = async (req, res) => {
  const { id } = req.params;
  const { flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status } = req.body;

  try {
    const flight = await Flight.findByPk(id);
    if (!flight) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    await flight.update({
      flight_number,
      departure_day,
      start_airport_id,
      end_airport_id,
      airport_stop_ids,
      seat_limit,
      status,
    });
    res.json({ message: 'Flight updated successfully' });
  } catch (err) {
    console.error('Error updating flight:', err);
    res.status(500).json({ error: 'Failed to update flight' });
  }
};

// Delete a flight
const deleteFlight = async (req, res) => {
  const { id } = req.params;

  try {
    const flight = await Flight.findByPk(id);
    if (!flight) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    await flight.destroy();
    res.json({ message: 'Flight deleted successfully' });
  } catch (err) {
    console.error('Error deleting flight:', err);
    res.status(500).json({ error: 'Failed to delete flight' });
  }
};

// Bulk activate all flights
const activateAllFlights = async (req, res) => {
  try {
    await Flight.update({ status: 1 }, { where: {} }); // Update all to active
    res.json({ message: 'All flights activated successfully' });
  } catch (err) {
    console.error('Error activating all flights:', err);
    res.status(500).json({ error: 'Failed to activate all flights' });
  }
};

// Bulk edit all flights (e.g., update seat_limit)
const editAllFlights = async (req, res) => {
  const { seat_limit } = req.body; // Example: Only seat_limit is editable in bulk
  if (!seat_limit || isNaN(seat_limit)) {
    return res.status(400).json({ error: 'Invalid seat limit value' });
  }

  try {
    await Flight.update({ seat_limit: parseInt(seat_limit) }, { where: {} });
    res.json({ message: 'All flights updated successfully' });
  } catch (err) {
    console.error('Error editing all flights:', err);
    res.status(500).json({ error: 'Failed to edit all flights' });
  }
};

// Bulk delete all flights
const deleteAllFlights = async (req, res) => {
  try {
    await Flight.destroy({ where: {} }); // Delete all flights
    res.json({ message: 'All flights deleted successfully' });
  } catch (err) {
    console.error('Error deleting all flights:', err);
    res.status(500).json({ error: 'Failed to delete all flights' });
  }
};

module.exports = {
  getFlights,
  addFlight,
  updateFlight,
  deleteFlight,
  activateAllFlights,
  editAllFlights,
  deleteAllFlights,
};