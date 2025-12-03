const { JoyRideSchedule, Helipad } = require('../model');
const db = require('../model');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Generate PNR
function generatePNR() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate Booking Number
function generateBookingNumber() {
  return `JOYRIDE${Date.now()}`;
}

// Create Razorpay Order
const createOrder = async (req, res) => {
  try {
    const { schedule_id, booking_date, passengers, email, phone } = req.body;

    // Validate schedule exists
    const schedule = await JoyRideSchedule.findByPk(schedule_id, {
      include: [
        { model: Helipad, as: 'startHelipad' },
        { model: Helipad, as: 'stopHelipad' }
      ]
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (schedule.status !== 1) {
      return res.status(400).json({ error: 'Schedule is not active' });
    }

    // Calculate total amount
    const basePrice = parseFloat(schedule.price) * passengers.length;
    const extraWeightCharges = passengers.reduce((total, passenger) => {
      const weight = parseFloat(passenger.weight) || 0;
      if (weight > 75) {
        return total + ((weight - 75) * 500);
      }
      return total;
    }, 0);
    const totalAmount = Math.round((basePrice + extraWeightCharges) * 100); // Convert to paise

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: totalAmount,
      currency: 'INR',
      receipt: `joyride_${Date.now()}`,
      notes: {
        schedule_id,
        booking_date,
        email,
        phone,
        passenger_count: passengers.length
      }
    });

    res.json({
      orderId: order.id,
      amount: totalAmount,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
      schedule: {
        id: schedule.id,
        departure_time: schedule.departure_time,
        arrival_time: schedule.arrival_time,
        price: schedule.price,
        startHelipad: schedule.startHelipad?.helipad_name,
        stopHelipad: schedule.stopHelipad?.helipad_name
      }
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
};

// Verify Payment and Create Booking
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      schedule_id,
      booking_date,
      passengers,
      email,
      phone,
      user_id
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Get schedule details
    const schedule = await JoyRideSchedule.findByPk(schedule_id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Calculate total price
    const basePrice = parseFloat(schedule.price) * passengers.length;
    const extraWeightCharges = passengers.reduce((total, passenger) => {
      const weight = parseFloat(passenger.weight) || 0;
      if (weight > 75) {
        return total + ((weight - 75) * 500);
      }
      return total;
    }, 0);
    const totalPrice = basePrice + extraWeightCharges;

    // Create booking
    const pnr = generatePNR();
    const bookingNumber = generateBookingNumber();

    const booking = await db.sequelize.transaction(async (t) => {
      // Create booking record
      const newBooking = await db.sequelize.query(
        `INSERT INTO joyride_bookings 
        (pnr, booking_number, schedule_id, booking_date, user_id, email, phone, 
         passenger_count, total_price, payment_id, payment_status, booking_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', 'CONFIRMED', NOW(), NOW())`,
        {
          replacements: [
            pnr,
            bookingNumber,
            schedule_id,
            booking_date,
            user_id || null,
            email,
            phone,
            passengers.length,
            totalPrice,
            razorpay_payment_id
          ],
          type: db.sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      const bookingId = newBooking[0];

      // Create passenger records
      for (const passenger of passengers) {
        await db.sequelize.query(
          `INSERT INTO joy_ride_passengers 
          (booking_id, name, age, weight, created_at, updated_at)
          VALUES (?, ?, ?, ?, NOW(), NOW())`,
          {
            replacements: [
              bookingId,
              passenger.name || 'Unknown',
              passenger.age || 0,
              parseFloat(passenger.weight) || 0
            ],
            type: db.sequelize.QueryTypes.INSERT,
            transaction: t
          }
        );
      }

      return { id: bookingId, pnr, bookingNumber };
    });

    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNumber: booking.bookingNumber,
        totalPrice
      }
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Failed to verify payment', details: err.message });
  }
};

// Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const bookings = await db.sequelize.query(
      `SELECT 
        jb.*,
        js.departure_day,
        js.departure_time,
        js.arrival_time,
        js.price as schedule_price,
        h1.helipad_name as start_helipad_name,
        h1.helipad_code as start_helipad_code,
        h2.helipad_name as stop_helipad_name,
        h2.helipad_code as stop_helipad_code,
        GROUP_CONCAT(jp.name SEPARATOR ', ') as passenger_names
      FROM joyride_bookings jb
      LEFT JOIN joy_ride_schedules js ON jb.schedule_id = js.id
      LEFT JOIN helipads h1 ON js.start_helipad_id = h1.id
      LEFT JOIN helipads h2 ON js.stop_helipad_id = h2.id
      LEFT JOIN joy_ride_passengers jp ON jb.id = jp.booking_id
      GROUP BY jb.id
      ORDER BY jb.created_at DESC`,
      { type: db.sequelize.QueryTypes.SELECT }
    );

    res.json(bookings);
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings', details: err.message });
  }
};

// Get booking by ID
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const [booking] = await db.sequelize.query(
      `SELECT 
        jb.*,
        js.departure_day,
        js.departure_time,
        js.arrival_time,
        js.price as schedule_price,
        h1.helipad_name as start_helipad_name,
        h1.helipad_code as start_helipad_code,
        h2.helipad_name as stop_helipad_name,
        h2.helipad_code as stop_helipad_code
      FROM joyride_bookings jb
      LEFT JOIN joy_ride_schedules js ON jb.schedule_id = js.id
      LEFT JOIN helipads h1 ON js.start_helipad_id = h1.id
      LEFT JOIN helipads h2 ON js.stop_helipad_id = h2.id
      WHERE jb.id = ?`,
      {
        replacements: [id],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Get passengers
    const passengers = await db.sequelize.query(
      `SELECT * FROM joy_ride_passengers WHERE booking_id = ?`,
      {
        replacements: [id],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    res.json({ ...booking, passengers });
  } catch (err) {
    console.error('Get booking error:', err);
    res.status(500).json({ error: 'Failed to fetch booking', details: err.message });
  }
};

// Update booking status
const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { booking_status, payment_status } = req.body;

    await db.sequelize.query(
      `UPDATE joyride_bookings 
       SET booking_status = COALESCE(?, booking_status),
           payment_status = COALESCE(?, payment_status),
           updated_at = NOW()
       WHERE id = ?`,
      {
        replacements: [booking_status, payment_status, id],
        type: db.sequelize.QueryTypes.UPDATE
      }
    );

    res.json({ message: 'Booking updated successfully' });
  } catch (err) {
    console.error('Update booking error:', err);
    res.status(500).json({ error: 'Failed to update booking', details: err.message });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    await db.sequelize.query(
      `UPDATE joyride_bookings 
       SET booking_status = 'CANCELLED',
           cancellation_reason = ?,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      {
        replacements: [cancellation_reason || 'Cancelled by admin', id],
        type: db.sequelize.QueryTypes.UPDATE
      }
    );

    res.json({ message: 'Booking cancelled successfully' });
  } catch (err) {
    console.error('Cancel booking error:', err);
    res.status(500).json({ error: 'Failed to cancel booking', details: err.message });
  }
};

// Get user's joyride bookings
const getUserJoyrideBookings = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const bookings = await db.sequelize.query(
      `SELECT 
        jb.*,
        js.departure_day,
        js.departure_time,
        js.arrival_time,
        js.price as schedule_price,
        h1.helipad_name as start_helipad_name,
        h1.helipad_code as start_helipad_code,
        h2.helipad_name as stop_helipad_name,
        h2.helipad_code as stop_helipad_code,
        GROUP_CONCAT(jp.name SEPARATOR ', ') as passenger_names
      FROM joyride_bookings jb
      LEFT JOIN joy_ride_schedules js ON jb.schedule_id = js.id
      LEFT JOIN helipads h1 ON js.start_helipad_id = h1.id
      LEFT JOIN helipads h2 ON js.stop_helipad_id = h2.id
      LEFT JOIN joy_ride_passengers jp ON jb.id = jp.booking_id
      WHERE jb.user_id = ?
      GROUP BY jb.id
      ORDER BY jb.created_at DESC`,
      {
        replacements: [userId],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    res.json(bookings);
  } catch (err) {
    console.error('Get user bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch user bookings', details: err.message });
  }
};

// Get all joyride bookings (admin)
const getJoyrideBookings = async (req, res) => {
  return getAllBookings(req, res);
};

// Create joyride booking (legacy support)
const createJoyrideBooking = async (req, res) => {
  return res.status(400).json({ 
    error: 'This endpoint is deprecated. Please use /api/joyride-bookings/create-order and /api/joyride-bookings/verify-payment' 
  });
};

module.exports = {
  createOrder,
  verifyPayment,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  getUserJoyrideBookings,
  getJoyrideBookings,
  createJoyrideBooking
};
