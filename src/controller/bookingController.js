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

  const totalFare = parseFloat(booking.totalFare);
  const paymentAmount = parseFloat(payment.payment_amount);
  if (!Number.isFinite(totalFare) || totalFare <= 0) {
    return res.status(400).json({ error: 'Total fare must be a positive number' });
  }
  if (totalFare !== paymentAmount) {
    return res.status(400).json({ error: 'Total fare does not match payment amount' });
  }

  try {
    let agent = null;
    if (booking.agentId) {
      agent = await models.Agent.findByPk(booking.agentId);
      if (!agent) {
        return res.status(400).json({ error: `Invalid agentId: ${booking.agentId}` });
      }
    }

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

      if (agent) {
        await agent.increment('no_of_ticket_booked', { by: booking.noOfPassengers, transaction: t });
      }

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

  if (!bookedSeat || !booking || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing required booking sections' });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels) || bookedSeat.seat_labels.length !== passengers.length) {
    return res.status(400).json({ success: false, error: 'seat_labels must be an array matching the number of passengers' });
  }

  const bookingRequiredFields = ['contact_no', 'email_id', 'noOfPassengers', 'totalFare', 'bookedUserId', 'schedule_id', 'bookDate', 'agentId'];
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

  const totalFare = parseFloat(booking.totalFare);
  if (!Number.isFinite(totalFare) || totalFare <= 0) {
    return res.status(400).json({ success: false, error: 'Total fare must be a positive number' });
  }

  try {
    const agent = await models.Agent.findByPk(booking.agentId);
    if (!agent) {
      return res.status(400).json({ success: false, error: `Invalid agentId: ${booking.agentId}` });
    }
    if (Number(agent.wallet_amount) < totalFare) {
      return res.status(400).json({ success: false, error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalFare}` });
    }

    let result;
    await models.sequelize.transaction(async (t) => {
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

      const pnr = await generatePNR();
      const bookingNo = `BOOK-${uuidv4().slice(0, 8)}`;

      const newBooking = await models.Booking.create(
        {
          pnr,
          bookingNo,
          ...booking,
          bookingStatus: 'SUCCESS',
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

      await agent.decrement('wallet_amount', { by: totalFare, transaction: t });
      await agent.increment('no_of_ticket_booked', { by: booking.noOfPassengers, transaction: t });

      const updatedAvailableSeats = await getAvailableSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });

      result = {
        pnr,
        bookingNo,
        bookingId: newBooking.id,
        availableSeats: updatedAvailableSeats,
        bookedSeat,
        booking,
        passengers,
        wallet_amount: Number(agent.wallet_amount) - totalFare,
      };
    });

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

async function getIrctcBookings(req, res) {
  console.log('Reached getIrctcBookings endpoint');
  try {
    const irctcAgent = await models.Agent.findOne({ where: { agentId: 'IRCTC' } });
    if (!irctcAgent) {
      return res.status(404).json({ error: 'IRCTC agent not found' });
    }

    const bookings = await models.Booking.findAll({
      where: { agentId: irctcAgent.id },
      include: [
        models.Passenger,
        models.FlightSchedule,
        models.BookedSeat,
        models.Payment,
        models.Agent,
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
          seatLabels: booking.BookedSeats.map((s) => s.seat_label),
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
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized: No valid user token provided' });
  }

  const userId = req.user.id;
  try {
    const userBookings = await models.Booking.findAll({
      where: { bookedUserId: userId },
      include: [
        { model: models.FlightSchedule, required: false },
        { model: models.Passenger, required: false },
        { model: models.BookedSeat, attributes: ['seat_label'], required: false },
        { model: models.Payment, as: 'Payments', required: false },
        { model: models.Agent, required: false },
      ],
      order: [['bookDate', 'DESC']],
    });

    const bookingsWithExtras = await Promise.all(
      userBookings.map(async (b) => {
        const billing = await models.Billing.findOne({ where: { user_id: b.bookedUserId } });
        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats.map((s) => s.seat_label),
          billing: billing ? billing.toJSON() : null,
        };
      })
    );

    return res.status(200).json(bookingsWithExtras);
  } catch (err) {
    console.error('getUserBookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
}

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
        { model: models.BookedSeat, attributes: ['seat_label'], required: false },
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        { model: models.Payment, required: false },
        { model: models.Agent, required: false },
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
            seatLabels: b.BookedSeats.map((s) => s.seat_label),
            billing: billing?.toJSON() || null,
          };
        } catch (billingErr) {
          console.warn(`Failed to fetch billing for booking ${b.id}:`, billingErr.message);
          return {
            ...b.toJSON(),
            seatLabels: b.BookedSeats.map((s) => s.seat_label),
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
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment, models.Agent],
      });
    } else if (pnr) {
      booking = await models.Booking.findOne({
        where: { pnr },
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment, models.Agent],
      });
    } else if (bookingNo) {
      booking = await models.Booking.findOne({
        where: { bookingNo },
        include: [models.Passenger, models.FlightSchedule, models.BookedSeat, models.Payment, models.Agent],
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
      seatLabels: booking.BookedSeats.map((s) => s.seat_label),
      billing: billing ? billing.toJSON() : null,
    };

    res.json(booking);
  } catch (err) {
    console.error('getBookingById error:', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
}

async function createBooking(req, res) {
  try {
    const { agentId } = req.body;
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(400).json({ error: `Invalid agentId: ${agentId}` });
      }
    }
    const booking = await models.Booking.create(req.body);
    if (agentId) {
      await agent.increment('no_of_ticket_booked', { by: req.body.noOfPassengers });
    }
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
    const { agentId } = req.body;
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(400).json({ error: `Invalid agentId: ${agentId}` });
      }
    }
    await booking.update(req.body);
    if (agentId) {
      const agent = await models.Agent.findByPk(agentId);
      await agent.increment('no_of_ticket_booked', { by: booking.noOfPassengers });
    }
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

async function getBookingByPnr(req, res) {
  const { pnr } = req.query;

  try {
    if (!pnr || typeof pnr !== 'string' || pnr.length < 6) {
      return res.status(400).json({ error: 'Invalid PNR. Must be a string of at least 6 characters.' });
    }

    const booking = await models.Booking.findOne({
      where: { pnr },
      include: [
        { model: models.BookedSeat, attributes: ['seat_label'], required: false },
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        { model: models.Payment, as: 'Payments', required: false },
        { model: models.Agent, required: false },
      ],
    });

    if (!booking) {
      return res.status(404).json({ error: `Booking not found for PNR: ${pnr}` });
    }

    const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });

    const response = {
      ...booking.toJSON(),
      seatLabels: booking.BookedSeats.map((s) => s.seat_label),
      billing: billing ? billing.toJSON() : null,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('getBookingByPnr error:', err);
    return res.status(500).json({ error: 'Failed to fetch booking' });
  }
}

async function cancelIrctcBooking(req, res) {
  const { id } = req.params;
  let t;

  try {
    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.Agent.agentId !== 'IRCTC') {
      await t.rollback();
      return res.status(400).json({ error: 'Booking is not associated with IRCTC agent' });
    }

    if (booking.bookingStatus === 'CANCELLED') {
      await t.rollback();
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    const departureTime = dayjs(booking.FlightSchedule.departure_time);
    const now = dayjs();
    const hoursUntilDeparture = departureTime.diff(now, 'hour');
    const totalFare = parseFloat(booking.totalFare);
    const numSeats = booking.BookedSeats.length;

    let refundAmount = 0;
    let cancellationFee = 0;

    if (hoursUntilDeparture > 96) {
      cancellationFee = numSeats * 400; // INR 400 per seat
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 48) {
      cancellationFee = totalFare * 0.25; // 25% of total fare
      refundAmount = totalFare - cancellationFee;
    } else if (hoursUntilDeparture >= 24) {
      cancellationFee = totalFare * 0.50; // 50% of total fare
      refundAmount = totalFare - cancellationFee;
    } else {
      cancellationFee = totalFare; // No refund
      refundAmount = 0;
    }

    if (refundAmount < 0) refundAmount = 0;

    const agent = await models.Agent.findByPk(booking.agentId, { transaction: t });
    await agent.increment('wallet_amount', { by: refundAmount, transaction: t });

    await models.BookedSeat.destroy({ where: { booking_id: booking.id }, transaction: t });
    await models.Passenger.destroy({ where: { bookingId: booking.id }, transaction: t });
    await models.Payment.destroy({ where: { booking_id: booking.id }, transaction: t });

    await booking.update({ bookingStatus: 'CANCELLED' }, { transaction: t });
    await booking.destroy({ transaction: t });

    const updatedAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    await t.commit();

    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    res.json({
      message: 'Booking cancelled successfully',
      refundAmount,
      cancellationFee,
      wallet_amount: Number(agent.wallet_amount) + refundAmount,
      note: 'Refund will be processed within 7–10 business days',
    });
  } catch (err) {
    if (t) await t.rollback();
    console.error('cancelIrctcBooking error:', err);
    res.status(500).json({ error: 'Failed to cancel booking: ' + err.message });
  }
}

async function rescheduleIrctcBooking(req, res) {
  const { id } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels } = req.body;
  let t;

  try {
    if (!newScheduleId || !newBookDate || !Array.isArray(newSeatLabels) || newSeatLabels.length === 0) {
      return res.status(400).json({ error: 'newScheduleId, newBookDate, and newSeatLabels (array) are required' });
    }
    if (!dayjs(newBookDate, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({ error: 'Invalid newBookDate format (YYYY-MM-DD)' });
    }

    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.FlightSchedule, required: true },
        { model: models.BookedSeat, required: true },
        { model: models.Agent, required: true },
      ],
      transaction: t,
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.Agent.agentId !== 'IRCTC') {
      await t.rollback();
      return res.status(400).json({ error: 'Booking is not associated with IRCTC agent' });
    }

    if (booking.bookingStatus !== 'SUCCESS' && booking.bookingStatus !== 'CONFIRMED') {
      await t.rollback();
      return res.status(400).json({ error: 'Only confirmed or successful bookings can be rescheduled' });
    }

    const departureTime = dayjs(booking.FlightSchedule.departure_time);
    const now = dayjs();
    const hoursUntilDeparture = departureTime.diff(now, 'hour');

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({ error: 'Rescheduling not permitted less than 24 hours before departure' });
    }

    const newSchedule = await models.FlightSchedule.findByPk(newScheduleId, { transaction: t });
    if (!newSchedule) {
      await t.rollback();
      return res.status(400).json({ error: 'New schedule not found' });
    }

    const availableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });
    for (const seat of newSeatLabels) {
      if (!availableSeats.includes(seat)) {
        await t.rollback();
        return res.status(400).json({ error: `Seat ${seat} is not available on new schedule` });
      }
    }

    if (newSeatLabels.length !== booking.BookedSeats.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Number of new seats must match original booking' });
    }

    let reschedulingFee = 0;
    if (hoursUntilDeparture > 48) {
      reschedulingFee = booking.BookedSeats.length * 500; // INR 500 per seat
    } else {
      reschedulingFee = booking.BookedSeats.length * 1000; // INR 1000 per seat
    }

    const oldTotalFare = parseFloat(booking.totalFare);
    const newTotalFare = parseFloat(newSchedule.price) * booking.BookedSeats.length;
    const fareDifference = newTotalFare > oldTotalFare ? newTotalFare - oldTotalFare : 0;

    const totalDeduction = reschedulingFee + fareDifference;
    const agent = await models.Agent.findByPk(booking.agentId, { transaction: t });

    if (Number(agent.wallet_amount) < totalDeduction) {
      await t.rollback();
      return res.status(400).json({ error: `Insufficient wallet balance: ${agent.wallet_amount} < ${totalDeduction}` });
    }

    await agent.decrement('wallet_amount', { by: totalDeduction, transaction: t });

    await models.BookedSeat.destroy({ where: { booking_id: booking.id }, transaction: t });

    for (const seat of newSeatLabels) {
      await models.BookedSeat.create(
        {
          booking_id: booking.id,
          schedule_id: newScheduleId,
          bookDate: newBookDate,
          seat_label: seat,
          booked_seat: 1,
        },
        { transaction: t }
      );
    }

    await booking.update(
      {
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        totalFare: newTotalFare,
        bookingStatus: 'CONFIRMED', // Rescheduled bookings are non-refundable
      },
      { transaction: t }
    );

    const oldAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: booking.schedule_id,
      bookDate: booking.bookDate,
      transaction: t,
    });

    const newAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      transaction: t,
    });

    await t.commit();

    if (req.io) {
      req.io.emit('seats-updated', [
        {
          schedule_id: booking.schedule_id,
          bookDate: booking.bookDate,
          availableSeats: oldAvailableSeats,
        },
        {
          schedule_id: newScheduleId,
          bookDate: newBookDate,
          availableSeats: newAvailableSeats,
        },
      ]);
    }

    res.json({
      message: 'Booking rescheduled successfully',
      bookingId: booking.id,
      newScheduleId,
      newBookDate,
      newSeatLabels,
      reschedulingFee,
      fareDifference,
      totalDeduction,
      wallet_amount: Number(agent.wallet_amount) - totalDeduction,
      note: 'Rescheduled booking is non-refundable',
    });
  } catch (err) {
    if (t) await t.rollback();
    console.error('rescheduleIrctcBooking error:', err);
    res.status(500).json({ error: 'Failed to reschedule booking: ' + err.message });
  }
}

module.exports = {
  completeBooking,
  bookSeatsWithoutPayment,
  generatePNR,
  getBookings,
  getBookingById,
  getIrctcBookings,
  getUserBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getBookingSummary,
  getBookingByPnr,
  cancelIrctcBooking,
  rescheduleIrctcBooking,
};