const { Op } = require('sequelize');
const dayjs = require('dayjs');
const { sumSeats } = require('../utils/seatUtils');
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

  /* All schedules of this flight */
  const schedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    attributes: ['id', 'departure_airport_id', 'arrival_airport_id'],
  });

  /* Pick those whose leg *starts no later* than ours and
     *ends no earlier* than ours (i.e., fully wrap our slice). */
  const ids = schedules
    .filter((s) => {
      const sDep = route.indexOf(s.departure_airport_id);
      const sArr = route.indexOf(s.arrival_airport_id);
      return (
        sDep !== -1 &&
        sArr !== -1 &&
        sDep <= depIdx && // starts same or earlier
        sArr >= arrIdx && // ends same or later
        sDep < sArr // sanity: forward leg
      );
    })
    .map((s) => s.id);

    return [schedule_id]; // de-duplicate for safety
}

exports.getWrappedScheduleIds = getWrappedScheduleIds;


exports.getBookedSeats = async (req, res) => {
  const models = getModels();
  try {
    const rows = await models.BookedSeat.findAll({
      include: [{ model: models.FlightSchedule }],
    });
    res.json(rows);
  } catch (err) {
    console.error('Error fetching booked seats:', err);
    res.status(500).json({ error: 'Server error' });
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
  const { bookDate, schedule_id, booked_seat } = req.body;

  // Validation
  if (!bookDate || !schedule_id || !booked_seat) {
    return res.status(400).json({ error: 'bookDate, schedule_id, and booked_seat are required' });
  }
  if (!Number.isInteger(booked_seat) || booked_seat <= 0) {
    return res.status(400).json({ error: 'booked_seat must be a positive integer' });
  }
  if (!dayjs(bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD expected)' });
  }

  const tx = await models.sequelize.transaction();
  try {
    // Verify schedule
    const schedule = await models.FlightSchedule.findByPk(schedule_id, { transaction: tx });
    if (!schedule) throw new Error('Schedule not found');

    // Check availability
    const seatsLeft = await sumSeats({ models, schedule_id, bookDate, transaction: tx });
    if (seatsLeft < booked_seat) {
      throw new Error(`Only ${seatsLeft} seat(s) left on ${bookDate} for schedule ${schedule_id}`);
    }

    // Upsert BookedSeat
    const [row, created] = await models.BookedSeat.findOrCreate({
      where: { schedule_id, bookDate },
      defaults: { booked_seat },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!created) await row.increment({ booked_seat }, { transaction: tx });

    await tx.commit();

    // Re-compute availability
    const updatedAvailableSeats = await sumSeats({ models, schedule_id, bookDate });

    // Emit WebSocket event
    if (req.io) {
      req.io.emit('seats-updated', { updates: [{ id: schedule_id, availableSeats: updatedAvailableSeats }] });
    }

    res.status(201).json({
      ...row.toJSON(),
      updatedAvailableSeats,
      affectedSchedules: [{ schedule_id, bookDate, seatsLeft: updatedAvailableSeats }],
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
  const { bookDate, schedule_id, booked_seat } = req.body;

  // Validate
  if (!bookDate || !schedule_id || !booked_seat) {
    return res.status(400).json({ error: 'bookDate, schedule_id, and booked_seat are required' });
  }
  if (!Number.isInteger(booked_seat) || booked_seat <= 0) {
    return res.status(400).json({ error: 'booked_seat must be a positive integer' });
  }
  if (!dayjs(bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (expected YYYY-MM-DD)' });
  }

  const transaction = await models.sequelize.transaction();
  try {
    // Find existing booked seat
    const row = await models.BookedSeat.findByPk(id, { transaction });
    if (!row) throw new Error('Booked seat not found');

    // Verify new schedule
    const schedule = await models.FlightSchedule.findByPk(schedule_id, { transaction });
    if (!schedule) throw new Error('Schedule not found');

    const oldScheduleId = row.schedule_id;
    const oldBookDate = row.bookDate;
    const oldBookedSeat = row.booked_seat;

    // Check availability
    const seatsLeft = await sumSeats({ models, schedule_id, bookDate, transaction });
    const adjustment = oldScheduleId === schedule_id && oldBookDate === bookDate ? oldBookedSeat : 0;
    if (seatsLeft + adjustment < booked_seat) {
      throw new Error(`Only ${seatsLeft + adjustment} seat(s) left on ${bookDate} for schedule ${schedule_id}`);
    }

    // Update or create
    if (oldScheduleId === schedule_id && oldBookDate === bookDate) {
      await row.update({ booked_seat }, { transaction });
    } else {
      // Clean up old booking
      const oldBooking = await models.BookedSeat.findOne({
        where: { schedule_id: oldScheduleId, bookDate: oldBookDate },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (oldBooking) {
        const newBookedSeat = oldBooking.booked_seat - oldBookedSeat;
        if (newBookedSeat <= 0) {
          await oldBooking.destroy({ transaction });
        } else {
          await oldBooking.update({ booked_seat: newBookedSeat }, { transaction });
        }
      }

      // Create or update new booking
      const [newBooking, created] = await models.BookedSeat.findOrCreate({
        where: { schedule_id, bookDate },
        defaults: { booked_seat },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!created) {
        await newBooking.update({ booked_seat }, { transaction });
      }
    }

    await transaction.commit();

    // Update seat counts
    const updates = [{
      id: schedule_id,
      availableSeats: await sumSeats({ models, schedule_id, bookDate, transaction: null }),
    }];

    // Emit WebSocket event
    if (req.io) {
      req.io.emit('seats-updated', { updates });
    } else {
      console.warn('WebSocket (req.io) not available, skipping seats-updated event');
    }

    res.json({
      message: 'Booked seat updated successfully',
      updatedAvailableSeats: updates[0].availableSeats,
      affectedSchedules: updates.map((sc) => ({
        schedule_id: sc.id,
        bookDate,
        seatsLeft: sc.availableSeats,
      })),
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
    const booked_seat = row.booked_seat;

    // Update or delete the booking for this schedule only
    const existingBooking = await models.BookedSeat.findOne({
      where: { schedule_id, bookDate },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existingBooking) {
      const newBookedSeat = existingBooking.booked_seat - booked_seat;
      if (newBookedSeat <= 0) {
        await existingBooking.destroy({ transaction });
      } else {
        await existingBooking.update({ booked_seat: newBookedSeat }, { transaction });
      }
    }

    await transaction.commit();

    // Calculate updated seat counts
    const updates = [{
      id: schedule_id,
      availableSeats: await sumSeats({ models, schedule_id, bookDate, transaction: null }),
    }];

    // Emit WebSocket event
    if (req.io) {
      req.io.emit('seats-updated', { updates });
    } else {
      console.warn('WebSocket (req.io) not available, skipping seats-updated event');
    }

    res.json({
      message: 'Booked seat deleted successfully',
      affectedSchedules: updates.map((sc) => ({
        schedule_id: sc.id,
        bookDate,
        seatsLeft: sc.availableSeats,
      })),
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error deleting booked seat:', err);
    res.status(400).json({ error: err.message });
  }
};























module.exports = exports;