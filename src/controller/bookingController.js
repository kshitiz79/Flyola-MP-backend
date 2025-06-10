const models = require('../model');
const { getAvailableSeats } = require('../utils/seatUtils');
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { Op } = require('sequelize');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');


dayjs.extend(utc);
dayjs.extend(timezone)



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

  // Input validation
  if (!bookedSeat || !booking || !billing || !payment || !Array.isArray(passengers) || !passengers.length) {
    return res.status(400).json({ error: 'Missing required booking sections' });
  }
  if (!dayjs(bookedSeat.bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }
  if (!bookedSeat.seat_labels || !Array.isArray(bookedSeat.seat_labels) || bookedSeat.seat_labels.length !== passengers.length) {
    return res.status(400).json({ error: 'seat_labels must be an array matching the number of passengers' });
  }
  const bookingRequiredFields = ['pnr', 'bookingNo', 'contact_no', 'email_id', 'noOfPassengers', 'totalFare', 'bookedUserId', 'schedule_id'];
  for (const f of bookingRequiredFields) {
    if (!booking[f]) return res.status(400).json({ error: `Missing booking field: ${f}` });
  }
  if (!billing.user_id) return res.status(400).json({ error: 'Missing billing field: user_id' });
  const paymentRequiredFields = ['user_id', 'payment_amount', 'payment_status', 'transaction_id', 'payment_mode'];
  for (const f of paymentRequiredFields) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }
  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }
  if (!['RAZORPAY', 'ADMIN'].includes(payment.payment_mode)) {
    return res.status(400).json({ error: 'Invalid payment_mode. Must be RAZORPAY or ADMIN' });
  }

  const totalFare = parseFloat(booking.totalFare);
  const paymentAmount = parseFloat(payment.payment_amount);
  if (!Number.isFinite(totalFare) || totalFare <= 0) {
    return res.status(400).json({ error: 'Total fare must be a positive number' });
  }
  if (Math.abs(totalFare - paymentAmount) > 0.01) { // Allow small float differences
    return res.status(400).json({ error: 'Total fare does not match payment amount' });
  }

  let transaction;
  try {
    // Validate user
    const user = await models.User.findByPk(booking.bookedUserId);
    if (!user) {
      return res.status(400).json({ error: `Invalid bookedUserId: ${booking.bookedUserId}` });
    }

    transaction = await models.sequelize.transaction();

    // Authenticate admin for ADMIN mode
    if (payment.payment_mode === 'ADMIN') {
      const token = req.headers.authorization?.startsWith('Bearer ') 
        ? req.headers.authorization.split(' ')[1] 
        : req.headers.token || req.cookies?.token;
      
      if (!token) {
        throw new Error('Unauthorized: No token provided for admin booking');
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== '1') { // Assuming '1' is admin role
          throw new Error('Forbidden: Only admins can use ADMIN payment mode');
        }
        if (decoded.id !== booking.bookedUserId || decoded.id !== billing.user_id || decoded.id !== payment.user_id) {
          throw new Error('User ID mismatch in booking, billing, or payment');
        }
      } catch (jwtErr) {
        throw new Error(`Invalid token: ${jwtErr.message}`);
      }

      payment.payment_status = 'SUCCESS';
      payment.payment_id = `ADMIN_${Date.now()}`;
      payment.order_id = `ADMIN_${Date.now()}`;
      payment.razorpay_signature = null;
      payment.message = 'Admin booking (no payment required)';
    } else if (payment.payment_mode === 'RAZORPAY') {
      if (!payment.payment_id || !payment.order_id || !payment.razorpay_signature) {
        throw new Error('Missing Razorpay payment fields: payment_id, order_id, or razorpay_signature');
      }
      const isValidSignature = await verifyPayment({
        order_id: payment.order_id,
        payment_id: payment.payment_id,
        signature: payment.razorpay_signature,
      });
      if (!isValidSignature) {
        throw new Error('Invalid Razorpay signature');
      }
    }

    // Verify seat availability
    const availableSeats = await getAvailableSeats({
      models,
      schedule_id: bookedSeat.schedule_id,
      bookDate: bookedSeat.bookDate,
      transaction,
    });
    for (const seat of bookedSeat.seat_labels) {
      if (!availableSeats.includes(seat)) {
        throw new Error(`Seat ${seat} is not available`);
      }
    }

    // Create booking
    const newBooking = await models.Booking.create(
      {
        ...booking,
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'SUCCESS',
        agentId: null, // Website bookings have no agent
      },
      { transaction }
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
        { transaction }
      );
    }

    // Create billing and payment records
    await models.Billing.create(
      { ...billing, user_id: booking.bookedUserId },
      { transaction }
    );
    await models.Payment.create(
      { ...payment, booking_id: newBooking.id, user_id: booking.bookedUserId },
      { transaction }
    );

    // Create passengers
    await models.Passenger.bulkCreate(
      passengers.map((p) => ({
        bookingId: newBooking.id,
        title: p.title,
        name: p.name,
        dob: p.dob || null,
        age: p.age,
        type: p.type,
      })),
      { transaction }
    );

    // Update available seats
    const updatedAvailableSeats = await getAvailableSeats({
      models,
      schedule_id: bookedSeat.schedule_id,
      bookDate: bookedSeat.bookDate,
      transaction,
    });

    await transaction.commit();

    // Emit seats-updated event
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        availableSeats: updatedAvailableSeats,
      });
    }

    return res.status(201).json({
      bookingId: newBooking.id,
      bookingNo: newBooking.bookingNo,
      bookingStatus: newBooking.bookingStatus,
      paymentStatus: newBooking.paymentStatus,
      availableSeats: updatedAvailableSeats,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error('[completeBooking] Error:', err);
    return res.status(400).json({ error: `Failed to complete booking: ${err.message}` });
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
        await models.sequelize.transaction(async(t) => {
            const availableSeats = await getAvailableSeats({
                models,
                schedule_id: bookedSeat.schedule_id,
                bookDate: bookedSeat.bookDate,
                userId: booking.bookedUserId, // Use bookedUserId as held_by
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

            const newBooking = await models.Booking.create({
                pnr,
                bookingNo,
                ...booking,
                bookingStatus: 'SUCCESS',
            }, { transaction: t });

            for (const seat of bookedSeat.seat_labels) {
                await models.BookedSeat.create({
                    booking_id: newBooking.id,
                    schedule_id: bookedSeat.schedule_id,
                    bookDate: bookedSeat.bookDate,
                    seat_label: seat,
                    booked_seat: 1,
                }, { transaction: t });
            }

            await models.SeatHold.destroy({
                where: {
                    schedule_id: bookedSeat.schedule_id,
                    bookDate: bookedSeat.bookDate,
                    seat_label: bookedSeat.seat_labels,
                    held_by: booking.bookedUserId, // Match with held_by
                },
                transaction: t,
            });

            await models.Passenger.bulkCreate(
                passengers.map((p) => ({
                    bookingId: newBooking.id,
                    title: p.title,
                    name: p.name,
                    dob: p.dob,
                    age: p.age,
                    type: p.type,
                })), { transaction: t }
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
        // Check authorization


        // Find IRCTC agent
        const irctcAgent = await models.Agent.findOne({ where: { agentId: 'IRCTC' } });
        if (!irctcAgent) {
            return res.status(404).json({ error: 'IRCTC agent not found' });
        }

        // Pagination and filtering
        const { page = 1, limit = 10, status, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;
        const where = { agentId: irctcAgent.id };
        if (status) where.bookingStatus = status.toUpperCase();
        if (startDate && endDate) {
            where.bookDate = {
                [models.Sequelize.Op.between]: [startDate, endDate] };
        }

        const bookings = await models.Booking.findAll({
            where,
            include: [
                { model: models.Passenger, required: false },
                { model: models.FlightSchedule, required: false },
                { model: models.BookedSeat, attributes: ['seat_label'], required: false },
                { model: models.Payment, as: 'Payments', required: false },
                { model: models.Agent, required: false },
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [
                ['created_at', 'DESC']
            ],
        });

        console.log('IRCTC Bookings found:', bookings.length);
        if (!bookings || bookings.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const bookingsWithBilling = await Promise.all(
            bookings.map(async(booking) => {
                const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });
                return {
                    ...booking.toJSON(),
                    seatLabels: booking.BookedSeats.map((s) => s.seat_label),
                    billing: billing?.toJSON() || null,

                };
            })
        );

        return res.status(200).json({ success: true, data: bookingsWithBilling });
    } catch (err) {
        console.error('getIrctcBookings error:', err.message, err.stack);
        return res.status(500).json({ success: false, error: `Failed to fetch IRCTC bookings: ${err.message}` });
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
                { model: models.Agent, required: false }, // Include Agent details
            ],
            order: [
                ['bookDate', 'DESC']
            ],
        });

        const bookingsWithExtras = await Promise.all(
            userBookings.map(async(b) => {
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
            order: [
                ['created_at', 'DESC']
            ],
        });

        const withBilling = await Promise.all(
            bookings.map(async(b) => {
                try {
                    const billing = await models.Billing.findOne({ where: { user_id: b.bookedUserId } });
                    if (!b.FlightSchedule) {
                        console.warn(`Booking ${b.id} (PNR: ${b.pnr}, bookingNo: ${b.bookingNo}) has no FlightSchedule (schedule_id: ${b.schedule_id})`);
                    }
                    return {
                        ...b.toJSON(),
                        seatLabels: b.BookedSeats.map((s) => s.seat_label),
                      billing: billing ? billing.toJSON() : null,

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

        // Fetch the booking with associated models
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

        // Ensure times are in IST (Asia/Kolkata)
        const now = dayjs().tz('Asia/Kolkata'); // Current time in IST

        // Combine bookDate with departure_time
        const bookDate = dayjs(booking.bookDate, 'YYYY-MM-DD').tz('Asia/Kolkata');
        const departureTimeRaw = booking.FlightSchedule.departure_time;

        // Validate departure_time format (expecting HH:mm:ss)
        if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
            await t.rollback();
            console.error(`Invalid departure_time format for schedule ${booking.schedule_id}: ${departureTimeRaw}. Expected HH:mm:ss.`);
            return res.status(400).json({ error: 'Invalid departure time format in flight schedule. Expected HH:mm:ss.' });
        }

        // Combine bookDate and departure_time to form a full datetime
        const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
        let departureTime = dayjs(departureDateTimeString).tz('Asia/Kolkata');

        // Validate the combined datetime
        if (!departureTime.isValid()) {
            await t.rollback();
            console.error(`Failed to parse combined departure datetime for schedule ${booking.schedule_id}: ${departureDateTimeString}`);
            return res.status(400).json({ error: 'Failed to parse departure time in flight schedule' });
        }

        const hoursUntilDeparture = departureTime.diff(now, 'hour');
        console.log(
            `Cancellation time: ${now.format()}, Departure time: ${departureTime.format()}, Hours until departure: ${hoursUntilDeparture}`
        );

        const totalFare = parseFloat(booking.totalFare);
        const numSeats = booking.BookedSeats.length;

        let refundAmount = 0;
        let cancellationFee = 0;

        // Calculate cancellation fee and refund based on time until departure
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
        console.log(`Total Fare: ${totalFare}, Num Seats: ${numSeats}, Cancellation Fee: ${cancellationFee}, Refund Amount: ${refundAmount}`);

        // Update agent's wallet
        const agent = await models.Agent.findByPk(booking.agentId, { transaction: t });
        const initialWalletAmount = Number(agent.wallet_amount);
        await agent.increment('wallet_amount', { by: refundAmount, transaction: t });
        await agent.reload({ transaction: t }); // Refresh agent instance to get updated wallet_amount
        const updatedWalletAmount = Number(agent.wallet_amount);
        console.log(`Agent ${agent.id} Wallet: ${initialWalletAmount} -> ${updatedWalletAmount} (Refund: ${refundAmount})`);

        // Clean up associated records
        await models.BookedSeat.destroy({ where: { booking_id: booking.id }, transaction: t });
        await models.Passenger.destroy({ where: { bookingId: booking.id }, transaction: t });
        await models.Payment.destroy({ where: { booking_id: booking.id }, transaction: t });

        // Update and delete the booking
        await booking.update({ bookingStatus: 'CANCELLED' }, { transaction: t });
        await booking.destroy({ transaction: t });

        // Update available seats
        const updatedAvailableSeats = await getAvailableSeats({
            models,
            schedule_id: booking.schedule_id,
            bookDate: booking.bookDate,
            transaction: t,
        });

        await t.commit();

        // Emit seats-updated event if socket.io is available
        if (req.io) {
            req.io.emit('seats-updated', {
                schedule_id: booking.schedule_id,
                bookDate: booking.bookDate,
                availableSeats: updatedAvailableSeats,
            });
        }

        // Respond with updated wallet amount
        res.json({
            message: 'Booking cancelled successfully',
            refundAmount,
            cancellationFee,
            wallet_amount: updatedWalletAmount,
            note: 'Wallet updated instantly; refund processing for external accounts (if applicable) takes 7–10 business days',
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
        // Validate input
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

        // Combine bookDate with departure_time
        const bookDate = dayjs(booking.bookDate, 'YYYY-MM-DD').tz('Asia/Kolkata');
        const departureTimeRaw = booking.FlightSchedule.departure_time;

        // Validate departure_time format (expecting HH:mm:ss)
        if (!departureTimeRaw || !/^\d{2}:\d{2}:\d{2}$/.test(departureTimeRaw)) {
            await t.rollback();
            console.error(`Invalid departure_time format for schedule ${booking.schedule_id}: ${departureTimeRaw}. Expected HH:mm:ss.`);
            return res.status(400).json({ error: 'Invalid departure time format in flight schedule. Expected HH:mm:ss.' });
        }

        // Combine bookDate and departure_time to form a full datetime
        const departureDateTimeString = `${booking.bookDate}T${departureTimeRaw}+05:30`; // e.g., "2025-06-05T12:00:00+05:30"
        const departureTime = dayjs(departureDateTimeString).tz('Asia/Kolkata');

        // Validate the combined datetime
        if (!departureTime.isValid()) {
            await t.rollback();
            console.error(`Failed to parse combined departure datetime for schedule ${booking.schedule_id}: ${departureDateTimeString}`);
            return res.status(400).json({ error: 'Failed to parse departure time in flight schedule' });
        }

        const now = dayjs().tz('Asia/Kolkata'); // Current time in IST
        const hoursUntilDeparture = departureTime.diff(now, 'hour');
        console.log(
            `Reschedule check - Current time: ${now.format()}, Departure time: ${departureTime.format()}, Hours until departure: ${hoursUntilDeparture}`
        );

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
        await agent.reload({ transaction: t }); // Refresh agent instance

        await models.BookedSeat.destroy({ where: { booking_id: booking.id }, transaction: t });

        for (const seat of newSeatLabels) {
            await models.BookedSeat.create({
                booking_id: booking.id,
                schedule_id: newScheduleId,
                bookDate: newBookDate,
                seat_label: seat,
                booked_seat: 1,
            }, { transaction: t });
        }

        await booking.update({
            schedule_id: newScheduleId,
            bookDate: newBookDate,
            totalFare: newTotalFare,
            bookingStatus: 'CONFIRMED', // Rescheduled bookings are non-refundable
        }, { transaction: t });

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

        // Emit separate seats-updated events for old and new schedules
        if (req.io) {
            req.io.emit('seats-updated', {
                schedule_id: booking.schedule_id,
                bookDate: booking.bookDate,
                availableSeats: oldAvailableSeats,
            });
            req.io.emit('seats-updated', {
                schedule_id: newScheduleId,
                bookDate: newBookDate,
                availableSeats: newAvailableSeats,
            });
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
            wallet_amount: Number(agent.wallet_amount),
            note: 'Rescheduled booking is non-refundable',
        });
    } catch (err) {
        if (t) await t.rollback();
        console.error('rescheduleIrctcBooking error:', err);
        res.status(500).json({ error: 'Failed to reschedule booking: ' + err.message });
    }
}

async function getBookingsByUser(req, res) {
  const { name, email } = req.query;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const bookings = await models.Booking.findAll({
      where: { email_id: email },
      include: [
        {
          model: models.Passenger,
          required: true,
          where: { name: { [Op.like]: `%${name}%` } }, // Use LIKE for MySQL
        },
        { model: models.FlightSchedule, required: false },
        { model: models.BookedSeat, attributes: ['seat_label'], required: false },
        { model: models.Payment, as: 'Payments', required: false },
        { model: models.Agent, required: false },
      ],
      order: [['bookDate', 'DESC']],
    });

    const bookingsWithExtras = await Promise.all(
      bookings.map(async (b) => {
        const billing = await models.Billing.findOne({ where: { user_id: b.bookedUserId } });
        return {
          ...b.toJSON(),
          seatLabels: b.BookedSeats.map((s) => s.seat_label),
          billing: billing ? billing.toJSON() : null,
        };
      })
    );

    if (bookingsWithExtras.length === 0) {
      return res.status(404).json({ error: 'No bookings found for the provided name and email' });
    }

    return res.status(200).json(bookingsWithExtras);
  } catch (err) {
    console.error('getBookingsByUser error:', err);
    return res.status(500).json({ error: 'Failed to fetch bookings' });
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
    getBookingByPnr,
    cancelIrctcBooking,
    rescheduleIrctcBooking,
    getBookingsByUser,
}