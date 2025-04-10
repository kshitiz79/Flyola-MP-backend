const FlightSchedule = require('./../model/flightSchedule');

// Get all flight schedules (filtered for active schedules for user-facing requests)
const getFlightSchedules = async (req, res) => {
  try {
    // Check if this is a user-facing request (e.g., via a query param or route distinction)
    const isUserRequest = req.query.user === 'true'; // Example: Add ?user=true for user requests
    const whereClause = isUserRequest ? { status: 1 } : {}; // Only active schedules for users
    const flightSchedules = await FlightSchedule.findAll({ where: whereClause });
    res.json(flightSchedules);
  } catch (err) {
    console.error('Error fetching flight schedules:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Add a new flight schedule
const addFlightSchedule = async (req, res) => {
  const { flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status } = req.body;

  try {
    const newSchedule = await FlightSchedule.create({
      flight_id,
      departure_airport_id,
      arrival_airport_id,
      departure_time,
      arrival_time,
      price,
      via_stop_id,
      via_schedule_id,
      status,
    });
    res.status(201).json({ message: 'Flight schedule added successfully', id: newSchedule.id });
  } catch (err) {
    console.error('Error adding flight schedule:', err);
    res.status(500).json({ error: 'Failed to add flight schedule' });
  }
};

// Update a flight schedule
const updateFlightSchedule = async (req, res) => {
  const { id } = req.params;
  const { flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status } = req.body;

  try {
    const schedule = await FlightSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }
    await schedule.update({
      flight_id,
      departure_airport_id,
      arrival_airport_id,
      departure_time,
      arrival_time,
      price,
      via_stop_id,
      via_schedule_id,
      status,
    });
    res.json({ message: 'Flight schedule updated successfully' });
  } catch (err) {
    console.error('Error updating flight schedule:', err);
    res.status(500).json({ error: 'Failed to update flight schedule' });
  }
};

// Delete a flight schedule
const deleteFlightSchedule = async (req, res) => {
  const { id } = req.params;

  try {
    const schedule = await FlightSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }
    await schedule.destroy();
    res.json({ message: 'Flight schedule deleted successfully' });
  } catch (err) {
    console.error('Error deleting flight schedule:', err);
    res.status(500).json({ error: 'Failed to delete flight schedule' });
  }
};

// Bulk activate all flight schedules
const activateAllFlightSchedules = async (req, res) => {
  try {
    await FlightSchedule.update({ status: 1 }, { where: {} }); // Update all to active
    res.json({ message: 'All flight schedules activated successfully' });
  } catch (err) {
    console.error('Error activating all flight schedules:', err);
    res.status(500).json({ error: 'Failed to activate all flight schedules' });
  }
};

// Bulk edit all flight schedules (e.g., update price)
const editAllFlightSchedules = async (req, res) => {
  const { price } = req.body; // Example: Only price is editable in bulk
  if (!price || isNaN(price)) {
    return res.status(400).json({ error: 'Invalid price value' });
  }

  try {
    await FlightSchedule.update({ price: parseFloat(price) }, { where: {} });
    res.json({ message: 'All flight schedules updated successfully' });
  } catch (err) {
    console.error('Error editing all flight schedules:', err);
    res.status(500).json({ error: 'Failed to edit all flight schedules' });
  }
};

// Bulk delete all flight schedules
const deleteAllFlightSchedules = async (req, res) => {
  try {
    await FlightSchedule.destroy({ where: {} }); // Delete all schedules
    res.json({ message: 'All flight schedules deleted successfully' });
  } catch (err) {
    console.error('Error deleting all flight schedules:', err);
    res.status(500).json({ error: 'Failed to delete all flight schedules' });
  }
};

module.exports = {
  getFlightSchedules,
  addFlightSchedule,
  updateFlightSchedule,
  deleteFlightSchedule,
  activateAllFlightSchedules,
  editAllFlightSchedules,
  deleteAllFlightSchedules,
};