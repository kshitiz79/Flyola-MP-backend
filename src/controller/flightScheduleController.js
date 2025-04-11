const getModels = () => require('../model'); // Returns { FlightSchedule, Flight, ... }

const getFlightSchedules = async (req, res) => {
  const models = getModels(); // No extra { models } destructuring
  console.log('FlightScheduleController models:', models.FlightSchedule ? 'Defined' : 'Undefined');
  try {
    const isUserRequest = req.query.user === 'true';
    const whereClause = isUserRequest ? { status: 1 } : {};
    const flightSchedules = await models.FlightSchedule.findAll({ where: whereClause });
    res.json(flightSchedules);
  } catch (err) {
    console.error('Error fetching flight schedules:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

const addFlightSchedule = async (req, res) => {
  const models = getModels();
  const { flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status } = req.body;
  try {
    const newSchedule = await models.FlightSchedule.create({
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

const updateFlightSchedule = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  const { flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status } = req.body;
  try {
    const schedule = await models.FlightSchedule.findByPk(id);
    if (!schedule) return res.status(404).json({ error: 'Flight schedule not found' });
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

const deleteFlightSchedule = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const schedule = await models.FlightSchedule.findByPk(id);
    if (!schedule) return res.status(404).json({ error: 'Flight schedule not found' });
    await schedule.destroy();
    res.json({ message: 'Flight schedule deleted successfully' });
  } catch (err) {
    console.error('Error deleting flight schedule:', err);
    res.status(500).json({ error: 'Failed to delete flight schedule' });
  }
};

const activateAllFlightSchedules = async (req, res) => {
  const models = getModels();
  try {
    await models.FlightSchedule.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flight schedules activated successfully' });
  } catch (err) {
    console.error('Error activating all flight schedules:', err);
    res.status(500).json({ error: 'Failed to activate all flight schedules' });
  }
};

const editAllFlightSchedules = async (req, res) => {
  const models = getModels();
  const { price } = req.body;
  if (!price || isNaN(price)) return res.status(400).json({ error: 'Invalid price value' });
  try {
    await models.FlightSchedule.update({ price: parseFloat(price) }, { where: {} });
    res.json({ message: 'All flight schedules updated successfully' });
  } catch (err) {
    console.error('Error editing all flight schedules:', err);
    res.status(500).json({ error: 'Failed to edit all flight schedules' });
  }
};

const deleteAllFlightSchedules = async (req, res) => {
  const models = getModels();
  try {
    await models.FlightSchedule.destroy({ where: {} });
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