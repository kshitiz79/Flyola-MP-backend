const models = require('./../model');

const getJoyrideBookings = async (req, res) => {
  try {
    const bookings = await models.JoyRideBooking.findAll({
      include: [
        { model: models.Joy_Ride_Slot, as: 'slot' },
        { model: models.User, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
    });
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
};

const createJoyrideBooking = async (req, res) => {
  const { slotId, email, phone, passengers, totalPrice } = req.body;
  const userId = req.user?.id; // Safely access user_id

  if (!req.user) {
    console.error('[JoyRideBookingController] No user attached to request:', {
      body: req.body,
      headers: req.headers,
    });
    return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
  }

  if (!userId || !slotId || !email || !phone || !passengers || !Array.isArray(passengers) || passengers.length === 0 || !totalPrice) {
    return res.status(400).json({ error: 'User ID, slot ID, email, phone, passengers, and total price are required' });
  }

  for (const passenger of passengers) {
    if (!passenger.name || !passenger.weight || isNaN(passenger.weight) || passenger.weight <= 0) {
      return res.status(400).json({ error: 'Each passenger must have a valid name and positive weight' });
    }
  }

  try {
    const result = await models.sequelize.transaction(async (t) => {
      const slot = await models.Joy_Ride_Slot.findByPk(slotId, { transaction: t });
      if (!slot) {
        throw new Error('Slot not found');
      }

      if (slot.seats < passengers.length) {
        throw new Error(`Not enough seats available. Required: ${passengers.length}, Available: ${slot.seats}`);
      }

      const basePrice = slot.price * passengers.length;
      const extraWeightCharges = passengers.reduce((total, passenger) => {
        const weight = parseFloat(passenger.weight);
        return total + (weight > 75 ? (weight - 75) * 500 : 0);
      }, 0);
      const calculatedTotalPrice = basePrice + extraWeightCharges;

      if (Math.abs(calculatedTotalPrice - totalPrice) > 0.01) {
        throw new Error('Total price mismatch');
      }

      const booking = await models.JoyRideBooking.create(
        {
          user_id: userId,
          slot_id: slotId,
          email,
          phone,
          passengers,
          total_price: totalPrice,
        },
        { transaction: t }
      );

      slot.seats -= passengers.length;
      await slot.save({ transaction: t });

      return booking;
    });

    res.status(201).json({
      message: 'Joyride booking created successfully',
      booking: result,
    });
  } catch (err) {
    console.error('[JoyRideBookingController] Booking creation failed:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
};

module.exports = {
  getJoyrideBookings,
  createJoyrideBooking,
};