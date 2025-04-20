const { sumSeats } = require('../utils/seatUtils');
const getModels = () => require('../model');

async function getWrappedScheduleIds(models, schedule_id) {
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule) throw new Error('Schedule not found');

  const flight = schedule.Flight;
  const routeAirports = flight.airport_stop_ids
    ? JSON.parse(flight.airport_stop_ids)
    : [flight.start_airport_id, flight.end_airport_id];

  // For single-segment bookings, only return the booked schedule ID
  const segmentStartIndex = routeAirports.indexOf(schedule.departure_airport_id);
  const segmentEndIndex = routeAirports.indexOf(schedule.arrival_airport_id);
  if (segmentStartIndex + 1 === segmentEndIndex) {
    // Direct flight (no stopovers), only include the booked schedule
    return [schedule_id];
  }

  // For multi-segment flights, include overlapping schedules
  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
  });

  const affectedSchedules = allSchedules.filter((s) => {
    const startIndex = routeAirports.indexOf(s.departure_airport_id);
    const endIndex = routeAirports.indexOf(s.arrival_airport_id);
    return startIndex <= segmentStartIndex && endIndex >= segmentEndIndex;
  });

  return affectedSchedules.map((s) => s.id);
}

async function getBookedSeats(req, res) {
  const models = getModels();
  try {
    const rows = await models.BookedSeat.findAll({
      include: [{ model: models.FlightSchedule }],
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getBookedSeatById(req, res) {
  const models = getModels();
  try {
    const row = await models.BookedSeat.findByPk(req.params.id, {
      include: [{ model: models.FlightSchedule }],
    });
    if (!row) return res.status(404).json({ error: 'Booked seat not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createBookedSeat(req, res) {
  const models = getModels();
  const { bookDate, schedule_id, booked_seat } = req.body;

  if (!bookDate || !schedule_id || !booked_seat || booked_seat <= 0) {
    return res
      .status(400)
      .json({ error: 'bookDate, schedule_id, and booked_seat are required' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const affectedScheduleIds = await getWrappedScheduleIds(models, schedule_id);

    for (const scheduleId of affectedScheduleIds) {
      const schedule = await models.FlightSchedule.findByPk(scheduleId, {
        include: [{ model: models.Flight }],
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);

      const seatsLeft = await sumSeats({
        models,
        schedule_id: scheduleId,
        bookDate,
        transaction: tx,
      });
      if (seatsLeft < booked_seat) {
        throw new Error(`Only ${seatsLeft} seat(s) left on ${bookDate} for schedule ${scheduleId}`);
      }
    }

    const bookedSeatPromises = affectedScheduleIds.map(async (scheduleId) => {
      const existingBooking = await models.BookedSeat.findOne({
        where: { schedule_id: scheduleId, bookDate },
        transaction: tx,
      });

      if (existingBooking) {
        await existingBooking.update(
          { booked_seat: existingBooking.booked_seat + booked_seat },
          { transaction: tx }
        );
        return existingBooking;
      } else {
        return models.BookedSeat.create(
          { bookDate, schedule_id: scheduleId, booked_seat },
          { transaction: tx }
        );
      }
    });

    const newBookedSeats = await Promise.all(bookedSeatPromises);
    const primaryBookedSeat = newBookedSeats.find((bs) => bs.schedule_id === schedule_id);

    await tx.commit();

    const updatedSeatCounts = await Promise.all(
      affectedScheduleIds.map(async (scheduleId) => {
        const schedule = await models.FlightSchedule.findByPk(scheduleId, {
          include: [{ model: models.Flight }],
        });
        const seatsLeft = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
          transaction: null,
        });
        return { schedule_id: scheduleId, bookDate, seatsLeft };
      })
    );

    updatedSeatCounts.forEach(({ schedule_id, bookDate, seatsLeft }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('seats-updated', {
            detail: { schedule_id, bookDate, seatsLeft },
          })
        );
      }
    });

    res.status(201).json({
      ...primaryBookedSeat.toJSON(),
      updatedAvailableSeats: updatedSeatCounts.find(
        (sc) => sc.schedule_id === schedule_id
      ).seatsLeft,
    });
  } catch (err) {
    await tx.rollback();
    res.status(400).json({ error: err.message });
  }
}

async function updateBookedSeat(req, res) {
  const models = getModels();
  const { id } = req.params;
  const { bookDate, schedule_id, booked_seat } = req.body;

  if (!bookDate || !schedule_id || !booked_seat || booked_seat <= 0) {
    return res
      .status(400)
      .json({ error: 'bookDate, schedule_id, and booked_seat are required' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const row = await models.BookedSeat.findByPk(id, { transaction: tx });
    if (!row) throw new Error('Booked seat not found');

    const oldScheduleId = row.schedule_id;
    const oldBookDate = row.bookDate;
    const oldBookedSeat = row.booked_seat;

    const affectedScheduleIds = await getWrappedScheduleIds(models, schedule_id);
    const oldAffectedScheduleIds = oldScheduleId === schedule_id && oldBookDate === bookDate
      ? affectedScheduleIds
      : await getWrappedScheduleIds(models, oldScheduleId);

    if (
      row.bookDate !== bookDate ||
      row.schedule_id !== schedule_id ||
      row.booked_seat !== booked_seat
    ) {
      for (const scheduleId of affectedScheduleIds) {
        const schedule = await models.FlightSchedule.findByPk(scheduleId, {
          include: [{ model: models.Flight }],
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });
        if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);

        const seatsLeft = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
          transaction: tx,
        });
        const adjustment = scheduleId === oldScheduleId && bookDate === oldBookDate
          ? oldBookedSeat
          : 0;
        if (seatsLeft - adjustment < booked_seat) {
          throw new Error(`Only ${seatsLeft} seat(s) left on ${bookDate} for schedule ${scheduleId}`);
        }
      }
    }

    const bookedSeatPromises = affectedScheduleIds.map(async (scheduleId) => {
      const existingBooking = await models.BookedSeat.findOne({
        where: { schedule_id: scheduleId, bookDate },
        transaction: tx,
      });

      if (existingBooking) {
        const adjustment = scheduleId === oldScheduleId && bookDate === oldBookDate
          ? oldBookedSeat
          : 0;
        await existingBooking.update(
          { booked_seat: existingBooking.booked_seat - adjustment + booked_seat },
          { transaction: tx }
        );
        return existingBooking;
      } else {
        return models.BookedSeat.create(
          { bookDate, schedule_id: scheduleId, booked_seat },
          { transaction: tx }
        );
      }
    });

    await Promise.all(bookedSeatPromises);

    if (oldScheduleId !== schedule_id || oldBookDate !== bookDate) {
      const cleanupPromises = oldAffectedScheduleIds.map(async (scheduleId) => {
        const existingBooking = await models.BookedSeat.findOne({
          where: { schedule_id: scheduleId, bookDate: oldBookDate },
          transaction: tx,
        });
        if (existingBooking) {
          const newBookedSeat = existingBooking.booked_seat - oldBookedSeat;
          if (newBookedSeat <= 0) {
            await existingBooking.destroy({ transaction: tx });
          } else {
            await existingBooking.update(
              { booked_seat: newBookedSeat },
              { transaction: tx }
            );
          }
        }
      });
      await Promise.all(cleanupPromises);
    }

    await tx.commit();

    const updatedSeatCounts = await Promise.all(
      affectedScheduleIds.map(async (scheduleId) => {
        const schedule = await models.FlightSchedule.findByPk(scheduleId, {
          include: [{ model: models.Flight }],
        });
        const seatsLeft = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
          transaction: null,
        });
        return { schedule_id: scheduleId, bookDate, seatsLeft };
      })
    );

    updatedSeatCounts.forEach(({ schedule_id, bookDate, seatsLeft }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('seats-updated', {
            detail: { schedule_id, bookDate, seatsLeft },
          })
        );
      }
    });

    res.json({ message: 'Booked seat updated', row });
  } catch (err) {
    await tx.rollback();
    res.status(400).json({ error: err.message });
  }
}

async function deleteBookedSeat(req, res) {
  const models = getModels();
  const tx = await models.sequelize.transaction();
  try {
    const row = await models.BookedSeat.findByPk(req.params.id, { transaction: tx });
    if (!row) throw new Error('Booked seat not found');
    await row.destroy({ transaction: tx });
    await tx.commit();
    res.json({ message: 'Booked seat deleted' });
  } catch (err) {
    await tx.rollback();
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getBookedSeats,
  getBookedSeatById,
  createBookedSeat,
  updateBookedSeat,
  deleteBookedSeat,
};