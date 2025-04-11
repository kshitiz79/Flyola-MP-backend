const getModels = () => require('../model'); // Lazy-load models

// Get all booked seats
const getBookedSeats = async (req, res) => {
  const models = getModels();
  try {
    console.log('BookedSeat model:', models.BookedSeat ? 'Defined' : 'Undefined'); // Debug info
    const bookedSeats = await models.BookedSeat.findAll({
      include: [{ model: models.FlightSchedule }],
    });
    res.json(bookedSeats);
  } catch (err) {
    console.error('Error fetching booked seats:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get a booked seat by ID
const getBookedSeatById = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const bookedSeat = await models.BookedSeat.findByPk(id, {
      include: [{ model: models.FlightSchedule }],
    });
    if (!bookedSeat) {
      return res.status(404).json({ error: 'Booked seat not found' });
    }
    res.json(bookedSeat);
  } catch (err) {
    console.error('Error fetching booked seat:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a booked seat
const createBookedSeat = async (req, res) => {
  const models = getModels();
  const { bookDate, schedule_id, booked_seat } = req.body;

  if (!bookDate || !schedule_id || !booked_seat || booked_seat <= 0) {
    return res.status(400).json({ error: 'Invalid input: bookDate, schedule_id, and booked_seat are required' });
  }

  const transaction = await models.sequelize.transaction();
  try {
    const schedule = await models.FlightSchedule.findByPk(schedule_id, {
      include: [{ model: models.Flight }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!schedule) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const bookedSeats = await models.BookedSeat.sum('booked_seat', {
      where: { schedule_id },
      transaction,
    }) || 0;

    const availableSeats = schedule.Flight.seat_limit - bookedSeats;
    if (availableSeats < booked_seat) {
      await transaction.rollback();
      return res.status(400).json({ error: `Not enough seats available. Requested: ${booked_seat}, Available: ${availableSeats}` });
    }

    const newBookedSeat = await models.BookedSeat.create(
      { bookDate, schedule_id, booked_seat },
      { transaction }
    );

    await transaction.commit();
    res.status(201).json(newBookedSeat);
  } catch (err) {
    await transaction.rollback();
    console.error('Error creating booked seat:', err);
    res.status(500).json({ error: 'Failed to book seat' });
  }
};

// Update a booked seat
const updateBookedSeat = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  const { bookDate, schedule_id, booked_seat } = req.body;

  if (!bookDate || !schedule_id || !booked_seat || booked_seat <= 0) {
    return res.status(400).json({ error: 'Invalid input: bookDate, schedule_id, and booked_seat are required' });
  }

  const transaction = await models.sequelize.transaction();
  try {
    const bookedSeat = await models.BookedSeat.findByPk(id, { transaction });
    if (!bookedSeat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Booked seat not found' });
    }

    if (schedule_id && schedule_id !== bookedSeat.schedule_id) {
      const oldSchedule = await models.FlightSchedule.findByPk(bookedSeat.schedule_id, {
        include: [{ model: models.Flight }],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      const oldBookedSeats = await models.BookedSeat.sum('booked_seat', {
        where: { schedule_id: bookedSeat.schedule_id },
        transaction,
      }) || 0;

      const newSchedule = await models.FlightSchedule.findByPk(schedule_id, {
        include: [{ model: models.Flight }],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!newSchedule) {
        await transaction.rollback();
        return res.status(404).json({ error: 'New schedule not found' });
      }

      const newBookedSeats = await models.BookedSeat.sum('booked_seat', {
        where: { schedule_id },
        transaction,
      }) || 0;

      const newAvailableSeats = newSchedule.Flight.seat_limit - newBookedSeats;
      if (newAvailableSeats < booked_seat) {
        await transaction.rollback();
        return res.status(400).json({ error: `Not enough seats in new schedule. Requested: ${booked_seat}, Available: ${newAvailableSeats}` });
      }
    } else if (booked_seat !== bookedSeat.booked_seat) {
      const schedule = await models.FlightSchedule.findByPk(bookedSeat.schedule_id, {
        include: [{ model: models.Flight }],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      const bookedSeats = await models.BookedSeat.sum('booked_seat', {
        where: { schedule_id: bookedSeat.schedule_id },
        transaction,
      }) || 0;

      const availableSeats = schedule.Flight.seat_limit - (bookedSeats - bookedSeat.booked_seat);
      if (availableSeats < booked_seat) {
        await transaction.rollback();
        return res.status(400).json({ error: `Not enough seats available. Requested: ${booked_seat}, Available: ${availableSeats}` });
      }
    }

    await bookedSeat.update(
      { bookDate, schedule_id, booked_seat },
      { transaction }
    );

    await transaction.commit();
    res.json({ message: 'Booked seat updated successfully', bookedSeat });
  } catch (err) {
    await transaction.rollback();
    console.error('Error updating booked seat:', err);
    res.status(500).json({ error: 'Failed to update booked seat' });
  }
};

// Delete a booked seat
const deleteBookedSeat = async (req, res) => {
  const models = getModels();
  const { id } = req.params;

  const transaction = await models.sequelize.transaction();
  try {
    const bookedSeat = await models.BookedSeat.findByPk(id, { transaction });
    if (!bookedSeat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Booked seat not found' });
    }

    await bookedSeat.destroy({ transaction });
    await transaction.commit();
    res.json({ message: 'Booked seat deleted successfully' });
  } catch (err) {
    await transaction.rollback();
    console.error('Error deleting booked seat:', err);
    res.status(500).json({ error: 'Failed to delete booked seat' });
  }
};

module.exports = {
  getBookedSeats,
  getBookedSeatById,
  createBookedSeat,
  updateBookedSeat,
  deleteBookedSeat,
};