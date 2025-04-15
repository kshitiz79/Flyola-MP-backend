// src/controllers/flightScheduleController.js
const getModels = () => require('../model'); // Lazy‑load models
const { Op } = require('sequelize');

/* ───────────────── helper: seats left for a date ───────────────── */
async function seatsLeft(models, schedule_id, bookDate) {
  const booked = await models.BookedSeat.sum('booked_seat', {
    where: { schedule_id, bookDate },
  });
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  return schedule.Flight.seat_limit - (booked || 0);
}

/* ───────── GET /flight-schedules ─────────
   Endpoint accepts ?user=true&date=YYYY-MM-DD
   and returns each schedule enriched with availableSeats.
──────────────────────────────────────────── */
async function getFlightSchedules(req, res) {
  const models = getModels();
  const isUserRequest = req.query.user === 'true';
  const bookDate = req.query.date;

  try {
    const where = isUserRequest ? { status: 1 } : {};
    const rows = await models.FlightSchedule.findAll({ where });

    const output = await Promise.all(
      rows.map(async (r) => ({
        ...r.toJSON(),
        availableSeats: await seatsLeft(models, r.id, bookDate || new Date().toISOString().slice(0, 10)),
      }))
    );

    res.json(output);
  } catch (err) {
    console.error('getFlightSchedules:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
}
/* ───────────────── simple CRUD helpers (unchanged) ───────── */
async function addFlightSchedule(req, res) {
  const models = getModels();
  try {
    const row = await models.FlightSchedule.create(req.body);
    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error('addFlightSchedule:', err);
    res.status(500).json({ error: 'Failed to add flight schedule' });
  }
}

async function updateFlightSchedule(req, res) {
  const models = getModels();
  try {
    const row = await models.FlightSchedule.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await row.update(req.body);
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
