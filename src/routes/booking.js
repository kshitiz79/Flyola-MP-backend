const express = require('express');
const router = express.Router();
const pool = require('../../db');
const Razorpay = require('razorpay');
// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  next();
};

const razorpay = new Razorpay({
    key_id: 'rzp_test_DiMiYr3VpklxK8', // Your Razorpay Key ID
    key_secret: 'yVDDF9cO2QWVdZ2DCqSIIbZq' // Your Razorpay Key Secret
  });





// Helper function to generate random PNR
function randomStrings(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Check seat availability
async function checkAvailable(scheduleId, date, noOfPassengers) {
  try {
    const [schedule] = await pool.query(
      'SELECT fs.*, f.seat_limit FROM flight_schedules fs JOIN flights f ON fs.flight_id = f.id WHERE fs.id = ?',
      [scheduleId]
    );

    if (!schedule.length) {
      return { status: 'error', message: 'Flight schedule not found' };
    }

    const [bookedSeats] = await pool.query(
      'SELECT SUM(booked_seat) as total_booked FROM booked_seats WHERE schedule_id = ? AND bookDate = ?',
      [scheduleId, date]
    );

    const availableSeats = schedule[0].seat_limit - (bookedSeats[0].total_booked || 0);

    if (noOfPassengers < 1 || noOfPassengers > 6) {
      return {
        status: 'error',
        message: 'Seat limit exceeded. Only 6 passengers allowed per booking.'
      };
    }

    if (noOfPassengers > availableSeats) {
      return {
        status: 'error',
        message: `Only ${availableSeats} seat(s) are available. You requested ${noOfPassengers} passenger(s).`
      };
    }

    return true;
  } catch (err) {
    console.error('Error checking availability:', err);
    throw err;
  }
}

// Booking Checkout
router.post('/checkout', checkAuth, async (req, res) => {
  const { schedule_id, date, departure_city, arrival_city, adult, child, infant } = req.body;

  const bookingDisableDate = new Date('2023-12-25'); // Example
  const bookingAllowDate = new Date();
  const requestDate = new Date(date);

  if (requestDate.toDateString() === bookingDisableDate.toDateString()) {
    return res.status(400).json({ success: false, message: `Booking is disabled on this ${date}` });
  }

  if (requestDate < bookingAllowDate) {
    return res.status(400).json({ success: false, message: `Booking is disabled on this ${date}` });
  }

  const noOfPassengers = parseInt(adult) + parseInt(child);

  try {
    const availabilityCheck = await checkAvailable(schedule_id, date, noOfPassengers);

    if (availabilityCheck !== true) {
      return res.status(400).json(availabilityCheck);
    }

    const [result] = await pool.query(
      'INSERT INTO temp_bookings (date, schedule_id, departure_city, arrival_city, adult, child, infant, bookingid, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, MD5(?), ?, NOW())',
      [date, schedule_id, departure_city, arrival_city, adult, child, infant, Date.now(), req.user.id]
    );

    return res.status(200).json({
      success: true,
      booking_no: result.insertId
    });
  } catch (err) {
    console.error('Booking checkout error:', err);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
});

// Booking Checkout Page
router.get('/checkout/:bookingid', async (req, res) => {
  try {
    const [booking] = await pool.query(
      'SELECT * FROM temp_bookings WHERE bookingid = MD5(?)',
      [req.params.bookingid]
    );

    if (!booking.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const [flight] = await pool.query(
      'SELECT * FROM flight_schedules WHERE id = ?',
      [booking[0].schedule_id]
    );

    res.json({ booking: booking[0], flight: flight[0] });
  } catch (err) {
    console.error('Error fetching booking page:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Book Ticket
router.post('/ticket', checkAuth, async (req, res) => {
  const { bookingid, passengers, billing_number, billing_email, totalFare, payFare } = req.body;
  const userId = req.user.id;

  try {
    const [temp] = await pool.query(
      'SELECT * FROM temp_bookings WHERE bookingid = MD5(?)',
      [bookingid]
    );

    if (!temp.length) {
      return res.status(404).json({ status: 'error', message: 'Temporary booking not found' });
    }

    const noOfPassengers = passengers.filter(p => p.type !== 'Infant').length;
    const availabilityCheck = await checkAvailable(temp[0].schedule_id, temp[0].date, noOfPassengers);

    if (availabilityCheck !== true) {
      return res.status(400).json(availabilityCheck);
    }

    let [billing] = await pool.query(
      'SELECT * FROM billing_details WHERE user_id = ?',
      [userId]
    );

    if (!billing.length) {
      await pool.query(
        'INSERT INTO billing_details (billing_name, billing_email, billing_number, user_id, created_at) VALUES (?, ?, ?, ?, NOW())',
        ['User Name', billing_email, billing_number, userId]
      );
    }

    const pnr = randomStrings();
    const paymentStatus = 'PAYMENT_PENDING';
    const bookingStatus = 'Pending';
    const payMode = null;

    const [bookingResult] = await pool.query(
      'INSERT INTO bookings (pnr, bookingNo, contact_no, email_id, noOfPassengers, bookDate, schedule_id, totalFare, transactionId, paymentStatus, bookingStatus, bookedUserId, pay_amt, pay_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [pnr, Date.now(), billing_number, billing_email, noOfPassengers, temp[0].date, temp[0].schedule_id, totalFare, Date.now() + Math.floor(Math.random() * 1000), paymentStatus, bookingStatus, userId, payFare, payMode]
    );

    for (const passenger of passengers) {
      await pool.query(
        'INSERT INTO passenger_details (bookingId, title, name, dob, type, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [bookingResult.insertId, passenger.title, passenger.full_name, passenger.dob, passenger.type]
      );
    }

    await pool.query(
      'INSERT INTO booked_seats (bookDate, schedule_id, booked_seat, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [temp[0].date, temp[0].schedule_id, noOfPassengers, userId]
    );

    res.status(200).json({
      status: 'success',
      bookingNo: bookingResult.insertId,
      pnr: Buffer.from(pnr).toString('base64'),
      transactionId: Date.now() + Math.floor(Math.random() * 1000),
      pay_amt: payFare,
      number: billing_number,
      message: 'Your ticket has been successfully booked!'
    });
  } catch (err) {
    console.error('Error booking ticket:', err);
    res.status(500).json({ status: 'error', message: 'An error occurred during flight booking' });
  }
});

// Confirm Booking and Process Payment
// Create Razorpay Order
router.post('/create-order', checkAuth, async (req, res) => {
    const { amount, bookingId } = req.body; // Amount in paise (e.g., 50000 for 500 INR)
  
    try {
      const order = await razorpay.orders.create({
        amount: amount * 100, // Convert to paise (Razorpay expects amount in paise)
        currency: 'INR',
        receipt: `order_rcptid_${bookingId}`,
        payment_capture: 1 // Auto-capture payment
      });
  
      res.status(200).json({
        success: true,
        orderId: order.id,
        key: razorpay.key_id, // Send key_id to frontend
        amount: order.amount,
        currency: order.currency
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(500).json({ success: false, message: 'Failed to create order' });
    }
  });
  
  // Confirm Booking and Process Payment with Razorpay
  router.post('/confirm', checkAuth, async (req, res) => {
    const { bookingId, razorpayPaymentId, razorpayOrderId, razorpaySignature, totalPrice } = req.body;
  
    try {
      // Verify Razorpay signature
      const crypto = require('crypto');
      const generatedSignature = crypto.createHmac('sha256', 'yVDDF9cO2QWVdZ2DCqSIIbZq') // Use key_secret
        .update(razorpayOrderId + '|' + razorpayPaymentId)
        .digest('hex');
  
      if (generatedSignature !== razorpaySignature) {
        return res.status(400).json({ status: 'error', message: 'Payment verification failed' });
      }
  
      // Fetch the booking
      const [booking] = await pool.query(
        'SELECT * FROM bookings WHERE id = ? AND bookedUserId = ?',
        [bookingId, req.user.id]
      );
  
      if (!booking.length) {
        return res.status(404).json({ status: 'error', message: 'Booking not found' });
      }
  
      if (booking[0].bookingStatus === 'Confirmed' || booking[0].bookingStatus === 'Cancelled') {
        return res.status(400).json({ status: 'error', message: 'Booking already processed' });
      }
  
      // Update booking with payment details
      await pool.query(
        'UPDATE bookings SET paymentStatus = ?, bookingStatus = ?, pay_mode = ?, paymentId = ?, updated_at = NOW() WHERE id = ?',
        ['PAYMENT_SUCCESS', 'Confirmed', 'Razorpay', razorpayPaymentId, bookingId]
      );
  
      // Book seats
      const [bookingDetails] = await pool.query(
        'SELECT schedule_id, bookDate, noOfPassengers FROM bookings WHERE id = ?',
        [bookingId]
      );
  
      await pool.query(
        'INSERT INTO booked_seats (bookDate, schedule_id, booked_seat, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE booked_seat = booked_seat + VALUES(booked_seat)',
        [bookingDetails[0].bookDate, bookingDetails[0].schedule_id, bookingDetails[0].noOfPassengers, req.user.id]
      );
  
      await pool.query(
        'UPDATE flight_schedules fs JOIN flights f ON fs.flight_id = f.id SET f.seat_limit = f.seat_limit - ? WHERE fs.id = ?',
        [bookingDetails[0].noOfPassengers, bookingDetails[0].schedule_id]
      );
  
      res.status(200).json({
        status: 'success',
        message: 'Booking confirmed successfully!',
        paymentStatus: 'PAYMENT_SUCCESS',
        bookingStatus: 'Confirmed'
      });
    } catch (err) {
      console.error('Error confirming booking:', err);
      res.status(500).json({ status: 'error', message: 'An error occurred during booking confirmation' });
    }
  });
  
  // Oth

// Check Availability
router.get('/availability/:schedule_id', async (req, res) => {
  const { schedule_id } = req.params;

  try {
    const [schedule] = await pool.query(
      'SELECT fs.*, f.seat_limit FROM flight_schedules fs JOIN flights f ON fs.flight_id = f.id WHERE fs.id = ?',
      [schedule_id]
    );

    if (!schedule.length) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    const [bookedSeats] = await pool.query(
      'SELECT SUM(booked_seat) as total_booked FROM booked_seats WHERE schedule_id = ?',
      [schedule_id]
    );

    const availableSeats = schedule[0].seat_limit - (bookedSeats[0].total_booked || 0);
    res.json({ availableSeats, totalSeats: schedule[0].seat_limit, scheduleDetails: schedule[0] });
  } catch (err) {
    console.error('Error checking seat availability:', err);
    res.status(500).json({ error: 'Failed to check seat availability' });
  }
});

module.exports = router;