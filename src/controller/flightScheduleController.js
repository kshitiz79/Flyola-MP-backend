const { format, toZonedTime } = require('date-fns-tz');
const { Op } = require('sequelize');
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
      const [year, month] = monthQuery.split("-").map(Number);
      const startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');

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
            } catch (e) {}

            const availableSeats = await sumSeats({
              models,
              schedule_id: r.id,
              bookDate: currentDate,
              transaction: null,
            });

            output.push({
              ...r.toJSON(),
              via_stop_id: JSON.stringify(viaStopIds),
              departure_date: currentDate,
              availableSeats,
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
          } catch (e) {}

          const availableSeats = await sumSeats({
            models,
            schedule_id: r.id,
            bookDate,
            transaction: null,
          });

          return {
            ...r.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date: bookDate,
            availableSeats,
          };
        })
      );
    }

    res.json(output);
  } catch (err) {
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
    console.error('Error deleting flight schedule:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
}

async function activateAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flight schedules activated' });
  } catch (err) {
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
    res.status(500).json({ error: 'Failed to update all' });
  }
}

async function deleteAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.destroy({ where: {} });
    res.json({ message: 'All flight schedules deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all' });
  }
}

async function updateFlightStops(req, res) {
  const models = getModels();
  const { flight_id, airport_stop_ids } = req.body;
  try {
    const flight = await models.Flight.findByPk(flight_id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    await flight.update({
      airport_stop_ids: JSON.stringify(airport_stop_ids),
    });
    res.json({ message: 'Flight stops updated' });
  } catch (err) {
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