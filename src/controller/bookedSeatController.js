// controllers/bookedSeatController.js
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const { sumSeats, getAvailableSeats } = require('../utils/seatUtils');
const { getRouteAirports } = require('./flightController');

const getModels = () => require('../model');

async function getWrappedScheduleIds(schedule_id) {
  const models = getModels();
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule || !schedule.Flight) {
    throw new Error('Schedule or associated Flight not found');
  }

  const flight = schedule.Flight;
  const route = getRouteAirports({
    start_airport_id: flight.start_airport_id,
    end_airport_id: flight.end_airport_id,
    airport_stop_ids: flight.airport_stop_ids,
  });

  const depIdx = route.indexOf(schedule.departure_airport_id);
  const arrIdx = route.indexOf(schedule.arrival_airport_id);
  if (depIdx === -1 || arrIdx === -1 || depIdx >= arrIdx) {
    throw new Error(
      `Invalid segment for schedule ${schedule_id}: indices ${depIdx}-${arrIdx} on route ${route.join('→')}`
    );
  }

  const schedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    attributes: ['id', 'departure_airport_id', 'arrival_airport_id'],
  });

  const ids = schedules
    .filter((s) => {
      const sDep = route.indexOf(s.departure_airport_id);
      const sArr = route.indexOf(s.arrival_airport_id);
      return (
        sDep !== -1 &&
        sArr !== -1 &&
        sDep <= depIdx &&
        sArr >= arrIdx &&
        sDep < sArr
      );
    })
    .map((s) => s.id);

  return [...new Set([schedule_id, ...ids])]; // Include original schedule_id
}

exports.getWrappedScheduleIds = getWrappedScheduleIds;

exports.getBookedSeats = async (req, res) => {
  const models = getModels();
  const { schedule_id, date } = req.query;
  try {
    if (!models.BookedSeat) {
      throw new Error('BookedSeat model is not defined');
    }
    const where = {};
    if (schedule_id) where.schedule_id = schedule_id;
    if (date) where.bookDate = date;
    const rows = await models.BookedSeat.findAll({
      where,
      attributes: ['seat_label'],
    });
    const seatLabels = rows.map((row) => row.seat_label);
    res.json({ bookedSeats: seatLabels });
  } catch (err) {
    console.error('getBookedSeats error:', err.stack);
    res.status(500).json({ error: `Failed to fetch booked seats: ${err.message}` });
  }
};

exports.getBookedSeatById = async (req, res) => {
  const models = getModels();
  try {
    const row = await models.BookedSeat.findByPk(req.params.id, {
      include: [{ model: models.FlightSchedule }],
    });
    if (!row) return res.status(404).json({ error: 'Booked seat not found' });
    res.json(row);
  } catch (err) {
    console.error('Error fetching booked seat by ID:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createBookedSeat = async (req, res) => {
  const models = getModels();
  const { bookDate, schedule_id, seat_label } = req.body;

  if (!bookDate || !schedule_id || !seat_label) {
    return res.status(400).json({ error: 'bookDate, schedule_id, and seat_label are required' });
  }
  if (!dayjs(bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD expected)' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const schedule = await models.FlightSchedule.findByPk(schedule_id, { transaction: tx });
    if (!schedule) throw new Error('Schedule not found');

    const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate, transaction: tx });
    if (!availableSeats.includes(seat_label)) {
      throw new Error(`Seat ${seat_label} is not available`);
    }

    const row = await models.BookedSeat.create(
      {
        schedule_id,
        bookDate,
        seat_label,
        booked_seat: 1,
      },
      { transaction: tx }
    );

    await tx.commit();

    const updatedAvailableSeats = await getAvailableSeats({ models, schedule_id, bookDate });
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id,
        bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.status(201).json({
      ...row.toJSON(),
      availableSeats: updatedAvailableSeats,
    });
  } catch (err) {
    await tx.rollback();
    console.error('Error creating booked seat:', err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateBookedSeat = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  const { bookDate, schedule_id, seat_label } = req.body;

  if (!bookDate || !schedule_id || !seat_label) {
    return res.status(400).json({ error: 'bookDate, schedule_id, and seat_label are required' });
  }
  if (!dayjs(bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (expected YYYY-MM-DD)' });
  }

  const transaction = await models.sequelize.transaction();
  try {
    const row = await models.BookedSeat.findByPk(id, { transaction });
    if (!row) throw new Error('Booked seat not found');

    const schedule = await models.FlightSchedule.findByPk(schedule_id, { transaction });
    if (!schedule) throw new Error('Schedule not found');

    const oldScheduleId = row.schedule_id;
    const oldBookDate = row.bookDate;
    const oldSeatLabel = row.seat_label;

    const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate, transaction });
    if (!availableSeats.includes(seat_label)) {
      throw new Error(`Seat ${seat_label} is not available`);
    }

    await row.update({ schedule_id, bookDate, seat_label }, { transaction });

    await transaction.commit();

    const updates = [
      {
        id: schedule_id,
        availableSeats: await getAvailableSeats({ models, schedule_id, bookDate }),
      },
    ];
    if (oldScheduleId !== schedule_id || oldBookDate !== bookDate) {
      updates.push({
        id: oldScheduleId,
        availableSeats: await getAvailableSeats({ models, schedule_id: oldScheduleId, bookDate: oldBookDate }),
      });
    }

    if (req.io) {
      req.io.emit('seats-updated', { updates });
    }

    res.json({
      message: 'Booked seat updated successfully',
      availableSeats: updates.find((u) => u.id === schedule_id).availableSeats,
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error updating booked seat:', err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteBookedSeat = async (req, res) => {
  const models = getModels();
  const { id } = req.params;

  const transaction = await models.sequelize.transaction();
  try {
    const row = await models.BookedSeat.findByPk(id, { transaction });
    if (!row) throw new Error('Booked seat not found');

    const schedule_id = row.schedule_id;
    const bookDate = row.bookDate;

    await row.destroy({ transaction });

    await transaction.commit();

    const updatedAvailableSeats = await getAvailableSeats({ models, schedule_id, bookDate });
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id,
        bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.json({
      message: 'Booked seat deleted successfully',
      availableSeats: updatedAvailableSeats,
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error deleting booked seat:', err);
    res.status(400).json({ error: err.message });
  }
};

module.exports = exports;