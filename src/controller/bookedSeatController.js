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
    // Lock row
    const schedule = await models.FlightSchedule.findByPk(schedule_id, {
      include: [{ model: models.Flight }],
      lock: tx.LOCK.UPDATE,
      transaction: tx,
    });
    if (!schedule) throw new Error('Schedule not found');

    const alreadyBooked = await sumSeats({
      models,
      schedule_id,
      bookDate,
      transaction: tx,
    });
    const seatsLeft = schedule.Flight.seat_limit - alreadyBooked;
    if (seatsLeft < booked_seat) {
      throw new Error(`Only ${seatsLeft} seat(s) left on ${bookDate}`);
    }

    const row = await models.BookedSeat.create(
      { bookDate, schedule_id, booked_seat },
      { transaction: tx }
    );

    await tx.commit();
    res.status(201).json({
      ...row.toJSON(),
      updatedAvailableSeats: seatsLeft - booked_seat,
    });
  } catch (err) {
    await tx.rollback();
    console.error('createBookedSeat:', err);
    res.status(400).json({ error: err.message });
  }
}

/* ───────────────────────── UPDATE ───────────────────────── */
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

    /* If date, schedule, or seat count changes, re-check capacity */
    if (
      row.bookDate !== bookDate ||
      row.schedule_id !== schedule_id ||
      row.booked_seat !== booked_seat
    ) {
      const schedule = await models.FlightSchedule.findByPk(schedule_id, {
        include: [{ model: models.Flight }],
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!schedule) throw new Error('Schedule not found');

      const alreadyBooked = await sumSeats({
        models,
        schedule_id,
        bookDate,
        transaction: tx,
      });

      const seatsLeft = schedule.Flight.seat_limit - (alreadyBooked - row.booked_seat);
      if (seatsLeft < booked_seat) {
        throw new Error(`Only ${seatsLeft} seat(s) left on ${bookDate}`);
      }
    }

    await row.update({ bookDate, schedule_id, booked_seat }, { transaction: tx });
    await tx.commit();
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