const models = require('../model');
const { sumSeats } = require('../utils/seatUtils');
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');

/**
 * Returns an array of all schedule IDs that cover the same segment range 
 * [departure_airport_id → arrival_airport_id] on the parent flight’s route.
 */
const routeIndex = (route, id) => route.indexOf(id);

async function getWrappedScheduleIds(models, schedule_id) {
  if (!models.FlightSchedule) throw new Error('FlightSchedule model is undefined');

  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule || !schedule.Flight) throw new Error('Schedule not found');

  /* Build the ordered route */
  let route = [];
  try {
    const stops = Array.isArray(schedule.Flight.airport_stop_ids)
      ? schedule.Flight.airport_stop_ids
      : JSON.parse(schedule.Flight.airport_stop_ids || '[]');
    route = [
      schedule.Flight.start_airport_id,
      ...stops,
      schedule.Flight.end_airport_id,
    ];
  } catch (err) {
    /* Fallback to start→end if stored JSON is corrupt */
    route = [schedule.Flight.start_airport_id, schedule.Flight.end_airport_id];
  }

  const depIdx = routeIndex(route, schedule.departure_airport_id);
  const arrIdx = routeIndex(route, schedule.arrival_airport_id);
  if (depIdx === -1 || arrIdx === -1 || depIdx >= arrIdx) {
    console.warn(
      `getWrappedScheduleIds – invalid indices for schedule ${schedule_id}: ` +
      `depIdx=${depIdx}, arrIdx=${arrIdx}, route=[${route.join('→')}]`
    );
    return [schedule_id]; // safety: fall back to self only
  }

  /* Direct leg (one segment) */
  if (depIdx + 1 === arrIdx) return [schedule_id];

  /* Gather all schedules of this flight */
  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: schedule.Flight.id },
    attributes: ['id', 'departure_airport_id', 'arrival_airport_id'],
  });

  /* Keep those whose slice fully covers ours */
  const wrapped = allSchedules
    .filter((s) => {
      const sDep = routeIndex(route, s.departure_airport_id);
      const sArr = routeIndex(route, s.arrival_airport_id);
      return sDep !== -1 && sArr !== -1 && sDep <= depIdx && sArr >= arrIdx && sDep < sArr;
    })
    .map((s) => s.id);

  return wrapped.length ? wrapped : [schedule_id];
}

/**
 * completeBooking: Handles full booking flow across multiple segments.
 * - Verifies Razorpay payment signature
 * - Checks and updates seats on all overlapping schedules
 * - Creates Booking, Billing, Payment, and Passenger records atomically
 * - Returns bookingId and updatedSeatCounts
 */
exports.completeBooking = async (req, res) => {
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  /* 1️⃣ Payload validation */
  if (
    !bookedSeat ||
    !booking ||
    !billing ||
    !payment ||
    !Array.isArray(passengers) ||
    passengers.length === 0
  ) {
    return res.status(400).json({ error: 'Missing required booking sections' });
  }
  if (!dayjs(bookedSeat.bookDate, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({ error: 'Invalid bookDate format (YYYY-MM-DD)' });
  }

  /* 2️⃣ Field presence checks (booking / billing / payment) */
  const bookingFields = [
    'pnr',
    'bookingNo',
    'contact_no',
    'email_id',
    'noOfPassengers',
    'totalFare',
    'bookedUserId',
    'schedule_id',
  ];
  for (const f of bookingFields) {
    if (!booking[f]) return res.status(400).json({ error: `Missing booking field: ${f}` });
  }
  if (!billing.user_id) {
    return res.status(400).json({ error: 'Missing billing field: user_id' });
  }
  const paymentFields = [
    'user_id',
    'payment_amount',
    'payment_status',
    'transaction_id',
    'payment_id',
    'payment_mode',
    'order_id',
    'razorpay_signature',
  ];
  for (const f of paymentFields) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }

  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }

  /* 3️⃣ Check payment_mode */
  if (payment.payment_mode !== 'RAZORPAY') {
    return res.status(400).json({ error: 'Invalid payment_mode. Must be RAZORPAY' });
  }

  /* ---------------------------------------------------------------- */
  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      /* 4️⃣ Verify Razorpay signature */
      const ok = await verifyPayment({
        order_id: payment.order_id,
        payment_id: payment.payment_id,
        signature: payment.razorpay_signature,
      });
      if (!ok) throw new Error('Invalid Razorpay signature');

      /* 5️⃣ Check seat availability on each wrapped segment */
      const wrappedIds = await getWrappedScheduleIds(models, bookedSeat.schedule_id);
      for (const sid of wrappedIds) {
        const left = await sumSeats({
          models,
          schedule_id: sid,
          bookDate: bookedSeat.bookDate,
          transaction: t,
        });
        if (left < bookedSeat.booked_seat) {
          throw new Error(`Only ${left} seat(s) left on ${bookedSeat.bookDate} for schedule ${sid}`);
        }
      }

      /* 6️⃣ Upsert BookedSeat rows */
      await Promise.all(
        wrappedIds.map(async (sid) => {
          const [row] = await models.BookedSeat.findOrCreate({
            where: { schedule_id: sid, bookDate: bookedSeat.bookDate },
            defaults: { booked_seat: bookedSeat.booked_seat },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!row.isNewRecord) {
            await row.increment({ booked_seat: bookedSeat.booked_seat }, { transaction: t });
          }
        })
      );

      /* 7️⃣ Create Booking, Billing, Payment, Passenger rows */
      const newBooking = await models.Booking.create(
        {
          ...booking,
          bookingStatus: 'CONFIRMED',
          paymentStatus: 'SUCCESS',
          bookingNo: booking.bookingNo || `BOOK-${uuidv4().slice(0, 8)}`,
        },
        { transaction: t }
      );

      await models.Billing.create(
        { ...billing, user_id: booking.bookedUserId },
        { transaction: t }
      );

      await createPaymentUtil(
        { ...payment, booking_id: newBooking.id, user_id: booking.bookedUserId },
        t
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

      /* 8️⃣ Prepare updated availability for response / front-end push */
      const updatedSeatCounts = await Promise.all(
        wrappedIds.map(async (sid) => ({
          schedule_id: sid,
          bookDate: bookedSeat.bookDate,
          seatsLeft: await sumSeats({
            models,
            schedule_id: sid,
            bookDate: bookedSeat.bookDate,
            transaction: t,
          }),
        }))
      );

      result = { bookingId: newBooking.id, updatedSeatCounts };
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('completeBooking error:', err);
    return res.status(400).json({ error: err.message });
  }
};
/**
 * CRUD endpoints below (optional if you need full controller):
 */

// Fetch all bookings with related billing info
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

// Fetch single booking by ID
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

// Basic create, update, delete (if needed)
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
