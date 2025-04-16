const getModels = () => require('../model'); // Lazy-load models
const { Op } = require('sequelize');

async function seatsLeft(models, schedule_id, bookDate) {
  const booked = await models.BookedSeat.sum('booked_seat', {
    where: { schedule_id, bookDate },
  });
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  return schedule.Flight.seat_limit - (booked || 0);
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
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of the month

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = d.toISOString().slice(0, 10);
        const weekday = d.toLocaleDateString("en-US", { weekday: "long" });

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
      const bookDate = req.query.date || new Date().toISOString().slice(0, 10);
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