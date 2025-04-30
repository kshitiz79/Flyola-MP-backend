const { format, toZonedTime } = require('date-fns-tz');
const { sumSeats } = require('../utils/seatUtils');
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
            viaStopIds = viaStopIds.filter(id => id && Number.isInteger(id) && id !== 0);
          } catch {}

          let availableSeats = 0;
          try {
            availableSeats = await sumSeats({
              models,
              schedule_id: schedule.id,
              bookDate: departure_date,
              transaction: null,
            });
          } catch {}

          output.push({
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date,
            availableSeats,
          });
        }
      }
    } else {
      const bookDate = req.query.date || format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      const results = await Promise.all(
        rows.map(async schedule => {
          const flight = schedule.Flight;
          if (!flight) return null;

          let viaStopIds = [];
          try {
            viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
            viaStopIds = viaStopIds.filter(id => id && Number.isInteger(id) && id !== 0);
          } catch {}

          let availableSeats = 0;
          try {
            availableSeats = await sumSeats({
              models,
              schedule_id: schedule.id,
              bookDate,
              transaction: null,
            });
          } catch {}

          return {
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date: bookDate,
            availableSeats,
          };
        })
      );
      output = results.filter(item => item);
    }

    res.json(output);
  } catch (err) {
    console.error('getFlightSchedules error:', err);
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
}

async function addFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, ...body } = req.body;
  try {
    const validViaStopIds = via_stop_id
      ? JSON.parse(via_stop_id).filter(id => id && Number.isInteger(id) && id !== 0)
      : [];

    const schedule = await models.FlightSchedule.create({
      ...body,
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
  const { via_stop_id, ...body } = req.body;
  try {
    const schedule = await models.FlightSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });

    const validViaStopIds = via_stop_id
      ? JSON.parse(via_stop_id).filter(id => id && Number.isInteger(id) && id !== 0)
      : [];

    await schedule.update({
      ...body,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('updateFlightSchedule error:', err);
    res.status(500).json({ error: 'Failed to update' });
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

module.exports = {
  getFlightSchedules,
  addFlightSchedule,
  updateFlightSchedule,
  deleteFlightSchedule,
  activateAllFlightSchedules,
  editAllFlightSchedules,
  deleteAllFlightSchedules,
  updateFlightStops,
};
