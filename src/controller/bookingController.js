const models = require('../model');
const { sumSeats, getAvailableSeats } = require('../utils/seatUtils');
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function generatePNR() {
  const maxAttempts = 10;
  let attempt = 0;

  async function tryGenerate() {
    while (attempt < maxAttempts) {
      try {
        let pnr = crypto.randomBytes(6).toString('base64').replace(/[^A-Z0-9]/g, '').slice(0, 6).toUpperCase();
        if (pnr.length === 6) {
          const existing = await models.Booking.findOne({ where: { pnr } });
          if (!existing) return pnr;
        }
      } catch (cryptoError) {
        console.warn('Crypto module issue, using UUID fallback for PNR:', cryptoError.message);
        let pnr = uuidv4().replace(/[^A-Z0-9]/g, '').slice(0, 6).toUpperCase();
        if (pnr.length === 6) {
          const existing = await models.Booking.findOne({ where: { pnr } });
          if (!existing) return pnr;
        }
      }
      attempt++;
    }

    let pnr = uuidv4().replace(/[^A-Z0-9]/g, '').slice(0, 6).toUpperCase();
    if (pnr.length < 6) {
      pnr = pnr.padEnd(6, 'X');
    }
    const existing = await models.Booking.findOne({ where: { pnr } });
    if (!existing) return pnr;

    throw new Error('Failed to generate unique PNR after multiple attempts');
  }

  return tryGenerate();
}

async function completeBooking(req, res) {
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  if (!bookedSeat || !booking || !billing || !payment || !Array.isArray(passengers) || !passengers.length) {
    return res.status(400).json({ error: 'Missing required booking sections' });
  }
  if (!dayjs(bookedSeat.bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels) || bookedSeat.seat_labels.length !== passengers.length) {
    return res.status(400).json({ error: 'seat_labels must be an array matching the number of passengers' });
  }

  for (const f of ['pnr', 'bookingNo', 'contact_no', 'email_id', 'noOfPassengers', 'totalFare', 'bookedUserId', 'schedule_id']) {
    if (!booking[f]) return res.status(400).json({ error: `Missing booking field: ${f}` });
  }
  if (!billing.user_id) return res.status(400).json({ error: 'Missing billing field: user_id' });
  for (const f of ['user_id', 'payment_amount', 'payment_status', 'transaction_id', 'payment_mode']) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }
  if (!['RAZORPAY', 'ADMIN', 'DUMMY'].includes(payment.payment_mode)) {
    return res.status(400).json({ error: 'Invalid payment_mode. Must be RAZORPAY, ADMIN, or DUMMY' });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      if (payment.payment_mode === 'ADMIN') {
        const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]) || req.headers.token;
        if (!token) throw new Error('Unauthorized: No token provided for admin booking');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (Number(decoded.role) !== 1) {
          throw new Error('Forbidden: Only admins can use ADMIN payment mode');
        }
        if (booking.bookedUserId !== decoded.id || billing.user_id !== decoded.id || payment.user_id !== decoded.id) {
          throw new Error('Forbidden: User ID mismatch');
        }
      }

      if (payment.payment_mode === 'RAZORPAY') {
        if (!payment.payment_id || !payment.order_id || !payment.razorpay_signature) {
          throw new Error('Missing Razorpay payment fields');
        }
        const ok = await verifyPayment({
          order_id: payment.order_id,
          payment_id: payment.payment_id,
          signature: payment.razorpay_signature,
        });
        if (!ok) throw new Error('Invalid Razorpay signature');
      }

      if (payment.payment_mode === 'DUMMY') {
        const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
        if (!isLocalhost && process.env.NODE_ENV === 'production') {
          throw new Error('Dummy payments are not allowed in production');
        }
      }

      const availableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });
      for (const seat of bookedSeat.seat_labels) {
        if (!availableSeats.includes(seat)) {
          throw new Error(`Seat ${seat} is not available`);
        }
      }

      const newBooking = await models.Booking.create(
        {
          ...booking,
          bookingStatus: 'CONFIRMED',
          paymentStatus: 'SUCCESS',
        },
        { transaction: t }
      );

      for (const seat of bookedSeat.seat_labels) {
        await models.BookedSeat.create(
          {
            booking_id: newBooking.id,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction: t }
        );
      }

      await models.Billing.create({ ...billing, user_id: booking.bookedUserId }, { transaction: t });
      await models.Payment.create({ ...payment, booking_id: newBooking.id, user_id: booking.bookedUserId }, { transaction: t });
      await models.Passenger.bulkCreate(
        passengers.map((p) => ({
          bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob,
          age: p.age,
          type: p.type,
        })),
        { transaction: t }
      );

      const updatedAvailableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      result = {
        bookingId: newBooking.id,
        bookingNo: newBooking.bookingNo,
        availableSeats: updatedAvailableSeats,
      };
    });

    // Emit WebSocket event
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: result.availableSeats,
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('completeBooking error:', err);
    return res.status(400).json({ error: err.message });
  }
}

async function bookSeatsWithoutPayment(req, res) {
  const { bookedSeat, booking, passengers } = req.body;

  // Validate request body
  if (!bookedSeat || !booking || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing required booking sections' });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels) || bookedSeat.seat_labels.length !== passengers.length) {
    return res.status(400).json({ success: false, error: 'seat_labels must be an array matching the number of passengers' });
  }

  const bookingRequiredFields = ['contact_no', 'email_id', 'noOfPassengers', 'totalFare', 'bookedUserId', 'schedule_id', 'bookDate'];
  for (const f of bookingRequiredFields) {
    if (!booking[f]) {
      return res.status(400).json({ success: false, error: `Missing booking field: ${f}` });
    }
  }

  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ success: false, error: 'Missing passenger fields: name, title, type, age' });
    }
  }

  if (!dayjs(bookedSeat.bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ success: false, error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      // Validate available seats
      const availableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });
      if (!availableSeats) {
        throw new Error(`Schedule ${bookedSeat.schedule_id} not found or invalid`);
      }
      for (const seat of bookedSeat.seat_labels) {
        if (!availableSeats.includes(seat)) {
          throw new Error(`Seat ${seat} is not available`);
        }
      }

      // Generate PNR and booking number
      const pnr = await generatePNR();
      const bookingNo = `BOOK-${uuidv4().slice(0, 8)}`;

      // Create booking
      const newBooking = await models.Booking.create(
        {
          pnr,
          bookingNo,
          ...booking,
          bookingStatus: 'SUCCESS',
          agent_type: 'IRCTC',
        },
        { transaction: t }
      );

      // Create booked seats
      for (const seat of bookedSeat.seat_labels) {
        await models.BookedSeat.create(
          {
            booking_id: newBooking.id,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            seat_label: seat,
            booked_seat: 1,
          },
          { transaction: t }
        );
      }

      // Create passengers
      await models.Passenger.bulkCreate(
        passengers.map((p) => ({
          bookingId: newBooking.id,
          title: p.title,
          name: p.name,
          dob: p.dob,
          age: p.age,
          type: p.type,
        })),
        { transaction: t }
      );

      // Get updated available seats
      const updatedAvailableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      // Prepare result, including all request data
      result = {
        pnr,
        bookingNo,
        bookingId: newBooking.id,
        availableSeats: updatedAvailableSeats,
        bookedSeat,
        booking,
        passengers,
      };
    });

    // Emit WebSocket event
    if (req.io) {
      console.log('Emitting seats-updated:', {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: result.availableSeats,
      });
      req.io.emit('seats-updated', {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: result.availableSeats,
      });
    }

    // Return success response with all data
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('bookSeatsWithoutPayment error:', { error: err.message, requestBody: req.body });
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
}
//

async function generatePNRController(req, res) {
  try {
    const pnr = await generatePNR();
    res.json({ pnr });
  } catch (err) {
    console.error("generatePNR error:", err);
    res.status(500).json({ error: "Failed to generate PNR" });
  }
}

async function getBookings(req, res) {
  try {
    if (!models.Booking) {
      throw new Error('Booking model is not defined');
    }
    const { status } = req.query;
    const where = {};
    if (status && status !== 'All Booking') {
      where.bookingStatus = status.toUpperCase();
    }

    const bookings = await models.Booking.findAll({
      where,
      include: [
        {
          model: models.BookedSeat,
          attributes: ['seat_label'],
          required: false,
        },
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        { model: models.Payment, required: false },
      ],
      order: [['created_at', 'DESC']],
    });

    const withBilling = await Promise.all(
      bookings.map(async (b) => {
        try {
          const billing = await models.Billing.findOne({ where: { user_id: b.bookedUserId } });
          if (!b.FlightSchedule) {
            console.warn(`Booking ${b.id} (PNR: ${b.pnr}, bookingNo: ${b.bookingNo}) has no FlightSchedule (schedule_id: ${b.schedule_id})`);
          }
          return {
            ...b.toJSON(),
            seatLabels: b.BookedSeats.map((s) => s.seat_label), // Added
            billing: billing?.toJSON() || null,
          };
        } catch (billingErr) {
          console.warn(`Failed to fetch billing for booking ${b.id}:`, billingErr.message);
          return {
            ...b.toJSON(),
            seatLabels: b.BookedSeats.map((s) => s.seat_label), // Added
            billing: null,
          };
        }
      })
    );

    res.json(withBilling);
  } catch (err) {
    console.error('getBookings error:', err.stack);
    res.status(500).json({ error: `Failed to fetch bookings: ${err.message}` });
  }
}

async function getBookingById(req, res) {
  const { id } = req.params;
  const { pnr, bookingNo } = req.query;

  try {
    let booking;
    if (id) {
      booking = await models.Booking.findByPk(id, {
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment],
      });
    } else if (pnr) {
      booking = await models.Booking.findOne({
        where: { pnr },
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment],
      });
    } else if (bookingNo) {
      booking = await models.Booking.findOne({
        where: { bookingNo },
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment],
      });
    } else {
      return res.status(400).json({ error: 'Must provide id, pnr, or bookingNo' });
    }

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });
    booking = {
      ...booking.toJSON(),
      billing: billing ? billing.toJSON() : null,
    };

    res.json(booking);
  } catch (err) {
    console.error('getBookingById error:', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
}

async function getIrctcBookings(req, res) {
  console.log('Reached getIrctcBookings endpoint');
  try {
    const bookings = await models.Booking.findAll({
      where: {
        agent_type: ['IRCTC'],
      },
      include: [
        models.Passenger,
        models.FlightSchedule,
        models.BookedSeat,
        models.Payment,
      ],
    });
    console.log('IRCTC Bookings found:', bookings.length, bookings.map(b => b.toJSON()));
    if (!bookings || bookings.length === 0) {
      return res.status(200).json([]);
    }
    const bookingsWithBilling = await Promise.all(
      bookings.map(async (booking) => {
        const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });
        return {
          ...booking.toJSON(),
          billing: billing ? billing.toJSON() : null,
        };
      })
    );
    res.json(bookingsWithBilling);
  } catch (err) {
    console.error('getIrctcBookings error:', err);
    res.status(500).json({ error: 'Failed to fetch IRCTC bookings' });
  }
}

async function getUserBookings(req, res) {
  const userId = req.user.id;
  try {
    const userBookings = await models.Booking.findAll({
      where: { bookedUserId: userId },
      include: [
        models.FlightSchedule,
        models.Passenger,
        models.BookedSeat,
        models.Payment,
      ],
      order: [['bookDate', 'DESC']],
    });

    return res.json(userBookings);
  } catch (err) {
    console.error('getUserBookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
}

async function createBooking(req, res) {
  try {
    const booking = await models.Booking.create(req.body);
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
}

async function updateBooking(req, res) {
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await booking.update(req.body);
    res.json({ message: 'Booking updated', booking });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
}

async function deleteBooking(req, res) {
  const { id } = req.params;
  let t;
  try {
    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, { transaction: t });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }
    await models.BookedSeat.destroy({ where: { booking_id: booking.id }, transaction: t });
    await models.Passenger.destroy({ where: { bookingId: booking.id }, transaction: t });
    await models.Payment.destroy({ where: { booking_id: booking.id }, transaction: t });
    await booking.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    if (t) await t.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function getBookingSummary(req, res) {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== "All Booking") {
      where.bookingStatus = status.toUpperCase();
    }

    const totalSeats = await models.Booking.sum("noOfPassengers", { where });
    const totalBookings = await models.Booking.count({ where });

    return res.json({ totalBookings, totalSeats: totalSeats || 0 });
  } catch (err) {
    console.error("Error fetching booking summary:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  completeBooking,
  bookSeatsWithoutPayment,
  generatePNR: generatePNRController,
  getBookings,
  getBookingById,
  getIrctcBookings,
  getUserBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getBookingSummary,
};