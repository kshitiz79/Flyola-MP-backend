const models = require('./../model'); // Adjust path to match your setup

// Get all joyride bookings (for admin use)
const getJoyrideBookings = async (req, res) => {
  try {
    const bookings = await models.JoyRideBooking.findAll({
      include: [{ model: models.Joy_Ride_Slot, as: 'slot' }],
    });
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Create a new joyride booking
const createJoyrideBooking = async (req, res) => {
  const { slotId, email, phone, passengers, totalPrice } = req.body;

  // Validate input
  if (!slotId || !email || !phone || !passengers || !Array.isArray(passengers) || passengers.length === 0 || !totalPrice) {
    return res.status(400).json({ error: 'Slot ID, email, phone, passengers, and total price are required' });
  }

  // Validate passengers
  for (const passenger of passengers) {
    if (!passenger.name || !passenger.weight || isNaN(passenger.weight) || passenger.weight <= 0) {
      return res.status(400).json({ error: 'Each passenger must have a valid name and positive weight' });
    }
  }

  try {
    // Start a transaction to ensure atomicity
    const result = await models.sequelize.transaction(async (t) => {
      // Find the slot
      const slot = await models.Joy_Ride_Slot.findByPk(slotId, { transaction: t });
      if (!slot) {
        throw new Error('Slot not found');
      }

      // Check seat availability
      if (slot.seats < passengers.length) {
        throw new Error(`Not enough seats available. Required: ${passengers.length}, Available: ${slot.seats}`);
      }

      // Calculate total price on server for validation
      const basePrice = slot.price * passengers.length;
      const extraWeightCharges = passengers.reduce((total, passenger) => {
        const weight = parseFloat(passenger.weight);
        return total + (weight > 75 ? (weight - 75) * 500 : 0);
      }, 0);
      const calculatedTotalPrice = basePrice + extraWeightCharges;

      // Validate client-provided totalPrice
      if (Math.abs(calculatedTotalPrice - totalPrice) > 0.01) {
        throw new Error('Total price mismatch');
      }

      // Create booking
      const booking = await models.JoyRideBooking.create(
        {
          slot_id: slotId,
          email,
          phone,
          passengers,
          total_price: totalPrice,
        },
        { transaction: t }
      );

      // Update slot seats
      slot.seats -= passengers.length;
      await slot.save({ transaction: t });

      return booking;
    });

    res.status(201).json({
      message: 'Joyride booking created successfully',
      booking: result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
};

module.exports = {
  getJoyrideBookings,
  createJoyrideBooking,
};