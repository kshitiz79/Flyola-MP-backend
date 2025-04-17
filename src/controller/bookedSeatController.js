const getModels = () => require('../model'); // Lazy-load models

/* ───────────────────────── helper ───────────────────────── */
async function sumSeats({ models, schedule_id, bookDate, transaction }) {
  return (
    (await models.BookedSeat.sum('booked_seat', {
      where: { schedule_id, bookDate },
      transaction,
    })) || 0
  );
}

/* ───────────────────────── GET all ───────────────────────── */
async function getBookedSeats(req, res) {
  const models = getModels();
  try {
    const rows = await models.BookedSeat.findAll({
      include: [{ model: models.FlightSchedule }],
    });
    res.json(rows);
  } catch (err) {
    console.error('getBookedSeats:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

/* ───────────────────────── GET by id ───────────────────────── */
async function getBookedSeatById(req, res) {
  const models = getModels();
  try {
    const row = await models.BookedSeat.findByPk(req.params.id, {
      include: [{ model: models.FlightSchedule }],
    });
    if (!row) return res.status(404).json({ error: 'Booked seat not found' });
    res.json(row);
  } catch (err) {
    console.error('getBookedSeatById:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

/* ───────────────────────── CREATE ───────────────────────── */
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

      const alreadyBooked = await sumSeats({
        models,
        schedule_id: scheduleId,
        bookDate,
        transaction: tx,
      });
      const seatsLeft = schedule.Flight.seat_limit - alreadyBooked;
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
        const alreadyBooked = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
        });
        const remaining = schedule.Flight.seat_limit - alreadyBooked;
        return { schedule_id: scheduleId, bookDate, seatsLeft: remaining };
      })
    );

    updatedSeatCounts.forEach(({ schedule_id, bookDate, seatsLeft }) => {
      window.dispatchEvent(
        new CustomEvent('seats-updated', {
          detail: { schedule_id, bookDate, seatsLeft },
        })
      );
    });

    res.status(201).json({
      ...primaryBookedSeat.toJSON(),
      updatedAvailableSeats: updatedSeatCounts.find(
        (sc) => sc.schedule_id === schedule_id
      ).seatsLeft,
    });
  } catch (err) {
    await tx.rollback();
    console.error('createBookedSeat:', err);
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

        const alreadyBooked = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
          transaction: tx,
        });
        const adjustment = scheduleId === oldScheduleId && bookDate === oldBookDate
          ? oldBookedSeat
          : 0;
        const seatsLeft = schedule.Flight.seat_limit - (alreadyBooked - adjustment);
        if (seatsLeft < booked_seat) {
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

    // Clean up old bookings if schedule or date changed
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
        const alreadyBooked = await sumSeats({
          models,
          schedule_id: scheduleId,
          bookDate,
        });
        const remaining = schedule.Flight.seat_limit - alreadyBooked;
        return { schedule_id: scheduleId, bookDate, seatsLeft: remaining };
      })
    );

    updatedSeatCounts.forEach(({ schedule_id, bookDate, seatsLeft }) => {
      window.dispatchEvent(
        new CustomEvent('seats-updated', {
          detail: { schedule_id, bookDate, seatsLeft },
        })
      );
    });

    res.json({ message: 'Booked seat updated', row });
  } catch (err) {
    await tx.rollback();
    console.error('updateBookedSeat:', err);
    res.status(400).json({ error: err.message });
  }
}

/* ───────────────────────── DELETE ───────────────────────── */
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
    console.error('deleteBookedSeat:', err);
    res.status(400).json({ error: err.message });
  }
}

/* ───────────────────────── exports ───────────────────────── */
module.exports = {
  getBookedSeats,
  getBookedSeatById,
  createBookedSeat,
  updateBookedSeat,
  deleteBookedSeat,
};