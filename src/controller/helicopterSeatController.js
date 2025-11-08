const getModels = () => require('../model');

// Helicopter-specific seat availability function
async function getAvailableHelicopterSeats({ models, schedule_id, bookDate, userId = null, transaction = null }) {
  const schedule = await models.HelicopterSchedule.findByPk(schedule_id, {
    include: [{ model: models.Helicopter, as: 'Helicopter' }],
    transaction,
  });
  
  if (!schedule || !schedule.Helicopter) {
    return [];
  }
  
  const helicopter = schedule.Helicopter;
  const seatLimit = helicopter.seat_limit || 6;
  
  // Generate seat labels (S1, S2, etc.)
  const allSeats = [];
  for (let i = 1; i <= seatLimit; i++) {
    allSeats.push(`S${i}`);
  }
  
  // Get booked seats for this helicopter schedule on this date
  const bookedSeatsRows = await models.BookedSeat.findAll({
    where: {
      schedule_id: schedule_id,
      bookDate,
    },
    attributes: ['seat_label'],
    transaction,
  });
  
  // Get held seats (if SeatHold table exists)
  const now = new Date();
  let heldSeatsRows = [];
  try {
    if (userId) {
      heldSeatsRows = await models.SeatHold.findAll({
        where: {
          schedule_id: schedule_id,
          bookDate,
          expires_at: { [models.Sequelize.Op.gt]: now },
          held_by: { [models.Sequelize.Op.ne]: userId },
        },
        attributes: ['seat_label'],
        transaction,
      });
    } else {
      heldSeatsRows = await models.SeatHold.findAll({
        where: {
          schedule_id: schedule_id,
          bookDate,
          expires_at: { [models.Sequelize.Op.gt]: now },
        },
        attributes: ['seat_label'],
        transaction,
      });
    }
  } catch (error) {
    // SeatHold table might not exist, ignore
  }
  
  const bookedSeats = new Set(bookedSeatsRows.map((row) => row.seat_label));
  const heldByOthers = new Set(heldSeatsRows.map((row) => row.seat_label));
  const unavailableSeats = new Set([...bookedSeats, ...heldByOthers]);
  
  const availableSeats = allSeats.filter((seat) => !unavailableSeats.has(seat));
  return availableSeats;
}

async function bookHelicopterSeat(req, res) {
  const models = getModels();
  const { schedule_id, bookDate, seat_label, booking_id } = req.body;

  if (!schedule_id || !bookDate || !seat_label || !booking_id) {
    return res.status(400).json({ error: 'schedule_id, bookDate, seat_label, and booking_id are required' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const availableSeats = await getAvailableHelicopterSeats({ models, schedule_id, bookDate, transaction: tx });

    if (!availableSeats.includes(seat_label)) {
      await tx.rollback();
      return res.status(400).json({ error: `Seat ${seat_label} is not available` });
    }

    await models.BookedSeat.create(
      {
        booking_id,
        schedule_id,
        bookDate,
        seat_label,
        booked_seat: 1,
      },
      { transaction: tx }
    );

    await tx.commit();

    // Emit WebSocket event
    const updatedAvailableSeats = await getAvailableHelicopterSeats({ models, schedule_id, bookDate });
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id,
        bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.json({ message: 'Helicopter seat booked successfully', seat_label });
  } catch (err) {
    await tx.rollback();
    res.status(500).json({ error: `Failed to book helicopter seat: ${err.message}` });
  }
}

async function getAvailableHelicopterSeatLabels(req, res) {
  const models = getModels();
  const { schedule_id, bookDate } = req.query;

  if (!schedule_id || !bookDate) {
    return res.status(400).json({ error: 'schedule_id and bookDate are required' });
  }

  try {
    const availableSeats = await getAvailableHelicopterSeats({ models, schedule_id, bookDate });
    res.json({ availableSeats });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch available helicopter seats: ${err.message}` });
  }
}

module.exports = {
  bookHelicopterSeat,
  getAvailableHelicopterSeatLabels,
  getAvailableHelicopterSeats,
};