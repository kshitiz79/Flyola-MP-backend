// File: controller/seatHoldController.js
const getModels = () => require('../model');
const dayjs = require('dayjs');
// Import getAvailableSeats from seatUtils
const { getAvailableSeats } = require('../utils/seatUtils');

async function holdSeats(req, res) {
  const models = getModels();
  const { schedule_id, bookDate, seat_labels, held_by } = req.body;

  if (!schedule_id || !bookDate || !Array.isArray(seat_labels) || seat_labels.length === 0 || !held_by) {
    return res.status(400).json({ error: 'schedule_id, bookDate, seat_labels (array), and held_by are required' });
  }

  if (!dayjs(bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }

  const tx = await models.sequelize.transaction();
  try {
    const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate, transaction: tx });

    for (const seat of seat_labels) {
      if (!availableSeats.includes(seat)) {
        await tx.rollback();
        return res.status(400).json({ error: `Seat ${seat} is not available` });
      }
    }

    const holdDuration = 10; // minutes
    const expiresAt = dayjs().add(holdDuration, 'minute').toDate();

    for (const seat of seat_labels) {
      await models.SeatHold.create(
        {
          schedule_id,
          bookDate,
          seat_label: seat,
          held_by, // Use held_by from request body
          held_at: new Date(),
          expires_at: expiresAt,
        },
        { transaction: tx }
      );
    }

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

    res.json({ message: 'Seats held successfully', expiresAt });
  } catch (err) {
    await tx.rollback();
    console.error('holdSeats error:', err);
    res.status(500).json({ error: `Failed to hold seats: ${err.message}` });
  }
}

module.exports = {
  holdSeats,
};
