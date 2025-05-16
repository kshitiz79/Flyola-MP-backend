const models = require('../model');
const { sumSeats } = require('../utils/seatUtils');
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');

const jwt = require('jsonwebtoken');





const crypto = require('crypto');





const generatePNR = async () => {
  const maxAttempts = 10;
  let attempt = 0;
  const crypto = require('crypto');

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
};



exports.completeBooking = async (req, res) => {
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  // 1. Basic shape checks
  if (!bookedSeat || !booking || !billing || !payment || !Array.isArray(passengers) || !passengers.length) {
    return res.status(400).json({ error: "Missing required booking sections" });
  }
  if (!dayjs(bookedSeat.bookDate, "YYYY-MM-DD", true).isValid()) {
    return res.status(400).json({ error: "Invalid bookDate format (YYYY-MM-DD)" });
  }

  // 2. Required booking fields
  for (const f of ["pnr","bookingNo","contact_no","email_id","noOfPassengers","totalFare","bookedUserId","schedule_id"]) {
    if (!booking[f]) return res.status(400).json({ error: `Missing booking field: ${f}` });
  }
  if (!billing.user_id)      return res.status(400).json({ error: "Missing billing field: user_id" });
  for (const f of ["user_id","payment_amount","payment_status","transaction_id","payment_id","payment_mode","order_id","razorpay_signature"]) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }
  for (const p of passengers) {
    if (!p.name||!p.title||!p.type||typeof p.age!=="number") {
      return res.status(400).json({ error:"Missing passenger fields: name, title, type, age" });
    }
  }
  if (!["RAZORPAY","ADMIN"].includes(payment.payment_mode)) {
    return res.status(400).json({ error: "Invalid payment_mode. Must be RAZORPAY or ADMIN" });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      // 3. ADMIN bookings must come from an admin token
      if (payment.payment_mode === "ADMIN") {
        const token = req.cookies?.token
          || (req.headers.authorization?.startsWith("Bearer ") && req.headers.authorization.split(" ")[1])
          || req.headers.token;
        if (!token) throw new Error("Unauthorized: No token provided for admin booking");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (Number(decoded.role) !== 1) {
          throw new Error("Forbidden: Only admins can use ADMIN payment mode");
        }
        if (
          booking.bookedUserId !== decoded.id ||
          billing.user_id       !== decoded.id ||
          payment.user_id       !== decoded.id
        ) throw new Error("Forbidden: User ID mismatch");
      }

      // 4. RAZORPAY signature check (always on in production)
      if (payment.payment_mode === "RAZORPAY") {
        const ok = await verifyPayment({
          order_id : payment.order_id,
          payment_id : payment.payment_id,
          signature : payment.razorpay_signature,
        });
        if (!ok) throw new Error("Invalid Razorpay signature");
      }

      // 5. Check & increment seat counts
      const seatsLeft = await sumSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t
      });
      if (seatsLeft < bookedSeat.booked_seat) {
        throw new Error(`Only ${seatsLeft} seat(s) left on ${bookedSeat.bookDate}`);
      }
      const [row, created] = await models.BookedSeat.findOrCreate({
        where   : { schedule_id: bookedSeat.schedule_id, bookDate: bookedSeat.bookDate },
        defaults: { booked_seat: bookedSeat.booked_seat },
        transaction: t,
        lock       : t.LOCK.UPDATE
      });
      if (!created) {
        await row.increment({ booked_seat: bookedSeat.booked_seat }, { transaction: t });
      }

      // 6. Create booking, billing, payment & passengers
      const newBooking = await models.Booking.create({
        ...booking,
        bookingStatus: "CONFIRMED",
        paymentStatus: "SUCCESS"
      }, { transaction: t });

      await models.Billing.create({ ...billing, user_id: booking.bookedUserId }, { transaction: t });
      await models.Payment.create({ ...payment, booking_id: newBooking.id, user_id: booking.bookedUserId }, { transaction: t });
      await models.Passenger.bulkCreate(
        passengers.map(p => ({
          bookingId: newBooking.id,
          title: p.title,
          name : p.name,
          dob  : p.dob,
          age  : p.age,
          type : p.type
        })), { transaction: t }
      );

      // 7. Return updated seat counts & booking ID
      const updatedSeatCounts = [{
        schedule_id: bookedSeat.schedule_id,
        bookDate   : bookedSeat.bookDate,
        seatsLeft  : await sumSeats({ models, schedule_id: bookedSeat.schedule_id, bookDate: bookedSeat.bookDate, transaction: t })
      }];
      result = {
        bookingId   : newBooking.id,
        bookingNo   : newBooking.bookingNo,
        updatedSeatCounts
      };
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error("completeBooking error:", err);
    return res.status(400).json({ error: err.message });
  }
};
exports.bookSeatsWithoutPayment = async (req, res) => {
  const { bookedSeat, booking, passengers } = req.body;

  
  if (!bookedSeat || !booking || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({ error: 'Missing required booking sections' });
  }

  const bookingRequiredFields = ['contact_no', 'email_id', 'noOfPassengers', 'totalFare', 'bookedUserId', 'schedule_id', 'bookDate'];
  for (const f of bookingRequiredFields) {
    if (!booking[f]) return res.status(400).json({ error: `Missing booking field: ${f}` });
  }

  const bookedSeatRequiredFields = ['schedule_id', 'bookDate', 'booked_seat'];
  for (const f of bookedSeatRequiredFields) {
    if (!bookedSeat[f]) return res.status(400).json({ error: `Missing bookedSeat field: ${f}` });
  }

  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }

  if (!dayjs(bookedSeat.bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      
      const seatsLeft = await sumSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });
      if (seatsLeft < bookedSeat.booked_seat) {
        throw new Error(`Only ${seatsLeft} seat(s) left on ${bookedSeat.bookDate} for schedule ${bookedSeat.schedule_id}`);
      }

      
      const [row, created] = await models.BookedSeat.findOrCreate({
        where: { schedule_id: bookedSeat.schedule_id, bookDate: bookedSeat.bookDate },
        defaults: { booked_seat: bookedSeat.booked_seat },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!created) {
        await row.increment({ booked_seat: bookedSeat.booked_seat }, { transaction: t });
      }

      
      const pnr = await generatePNR();
      const bookingNo = `BOOK-${uuidv4().slice(0, 8)}`;

      
      const newBooking = await models.Booking.create(
        {
          pnr,
          bookingNo,
          ...booking,
          bookingStatus: 'PENDING',
          paymentStatus: 'PENDING',
          agent_type: 'IRCTC',
        },
        { transaction: t }
      );

      
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

      const updatedSeatCounts = [
        {
          schedule_id: bookedSeat.schedule_id,
          bookDate: bookedSeat.bookDate,
          seatsLeft: await sumSeats({
            models,
            schedule_id: bookedSeat.schedule_id,
            bookDate: bookedSeat.bookDate,
            transaction: t,
          }),
        },
      ];
      console.log('Updated seat counts:', updatedSeatCounts);

      result = { pnr, bookingNo, bookingId: newBooking.id, updatedSeatCounts };
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('bookSeatsWithoutPayment error:', err);
    return res.status(400).json({ error: err.message });
  }
};


// In your bookings controller file (e.g., bookingsController.js)
exports.generatePNR = async (req, res) => {
  try {
    const pnr = await generatePNR(); // Use the existing generatePNR function
    res.json({ pnr });
  } catch (err) {
    console.error("generatePNR error:", err);
    res.status(500).json({ error: "Failed to generate PNR" });
  }
};


exports.getBookings = async (req, res) => {
  try {
    const bookings = await models.Booking.findAll({
      include: [models.BookedSeat, models.Passenger, models.FlightSchedule, models.Payment],
    });
    const withBilling = await Promise.all(
      bookings.map(async (b) => ({
        ...b.toJSON(),
        billing: (await models.Billing.findOne({ where: { user_id: b.bookedUserId } }))?.toJSON() || null,
      }))
    );
    res.json(withBilling);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};


exports.getBookingById = async (req, res) => {
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id, {
      include: [models.BookedSeat, models.Passenger, models.FlightSchedule, models.Payment],
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });
    res.json({ ...booking.toJSON(), billing: billing?.toJSON() || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};


exports.createBooking = async (req, res) => {
  try {
    const booking = await models.Booking.create(req.body);
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateBooking = async (req, res) => {
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
};

exports.deleteBooking = async (req, res) => {
  const { id } = req.params;
  let t;
  try {
    t = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, { transaction: t });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }
    await models.BookedSeat.destroy({ where: { schedule_id: booking.schedule_id }, transaction: t });
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
};




exports.getBookingSummary = async (req, res) => {
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
};









exports.getBookingById = async (req, res) => {
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
};


exports.getIrctcBookings = async (req, res) => {
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
};



exports.getUserBookings = async (req, res) => {
  const userId = req.user.id;           // set by authenticate()
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
};