const models = require('./../model');
const { razorpay } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');

const getJoyrideBookings = async (req, res) => {
  try {
    const bookings = await models.JoyRideBooking.findAll({
      include: [
        {
          model: models.Joy_Ride_Slot,
          as: 'slot',
          attributes: ['id', 'date', 'time', 'price', 'seats'],
        },
        {
          model: models.User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
    res.status(200).json(bookings);
  } catch (err) {
    console.error('[JoyRideBookingController] Database query failed:', err.message);
    res.status(500).json({ error: 'Database query failed: ' + err.message });
  }
};

const getUserJoyrideBookings = async (req, res) => {
  const userId = req.user?.id;

  if (!req.user || !userId) {
    console.log('[JoyRideBookingController] Unauthenticated user accessing user bookings');
    return res.status(200).json([]);
  }

  try {
    const bookings = await models.JoyRideBooking.findAll({
      where: { user_id: userId },
      include: [
        { model: models.Joy_Ride_Slot, as: 'slot', attributes: ['id', 'date', 'time', 'price', 'seats'] },
      ],
    });
    res.status(200).json(bookings);
  } catch (err) {
    console.error('[JoyRideBookingController] Failed to fetch user bookings:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookings: ' + err.message });
  }
};

const createJoyrideBooking = async (req, res) => {
  const { slotId, email, phone, passengers, totalPrice } = req.body;
  const userId = req.user?.id;

  if (!req.user || !userId) {
    console.error('[JoyRideBookingController] No user or user ID:', {
      user: req.user,
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

      let order;
      try {
        order = await razorpay.orders.create({
          amount: totalPrice * 100,
          currency: 'INR',
          receipt: `joyride_booking_${booking.id}_${Date.now()}`,
        });
      } catch (sdkErr) {
        throw new Error('Razorpay order creation failed: ' + sdkErr.message);
      }

      const payment = await createPaymentUtil(
        {
          transaction_id: order.id,
          payment_id: `pending_${order.id}`,
          payment_status: 'PENDING',
          payment_mode: 'RAZORPAY',
          payment_amount: totalPrice,
          message: 'Payment initiated for joyride booking',
          booking_id: booking.id,
          user_id: userId,
        },
        t
      );

      return { booking, payment, order_id: order.id };
    });

    res.status(201).json({
      message: 'Joyride booking created successfully',
      booking: result.booking,
      payment: result.payment,
      order_id: result.order_id,
    });
  } catch (err) {
    console.error('[JoyRideBookingController] Booking creation failed:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
};

module.exports = {
  getJoyrideBookings,
  getUserJoyrideBookings,
  createJoyrideBooking,
};