
// seatController


const getModels = () => require('../model');
const { getAvailableSeats } = require('../utils/seatUtils');

async function bookSeat(req, res) {
  const models = getModels();
  const { schedule_id, bookDate, seat_label, booking_id } = req.body;

  if (!schedule_id || !bookDate || !seat_label || !booking_id) {
    return res.status(400).json({ error: 'schedule_id, bookDate, seat_label, and booking_id are required' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate, transaction: tx });

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
    const updatedAvailableSeats = await getAvailableSeats({ models, schedule_id, bookDate });
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id,
        bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.json({ message: 'Seat booked successfully', seat_label });
  } catch (err) {
    await tx.rollback();
    console.error('bookSeat error:', err);
    res.status(500).json({ error: `Failed to book seat: ${err.message}` });
  }
}

async function getAvailableSeatLabels(req, res) {
  const models = getModels();
  const { schedule_id, bookDate } = req.query;

  if (!schedule_id || !bookDate) {
    return res.status(400).json({ error: 'schedule_id and bookDate are required' });
  }

  try {
    const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate });
    res.json({ availableSeats });
  } catch (err) {
    console.error('getAvailableSeatLabels error:', err);
    res.status(500).json({ error: `Failed to fetch available seats: ${err.message}` });
  }
}

module.exports = {
  bookSeat,
  getAvailableSeatLabels,
};