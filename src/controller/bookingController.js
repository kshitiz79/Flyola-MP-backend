const models = require('../model');
const { sumSeats } = require('../utils/seatUtils');
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');









exports.completeIrctcBooking = async (req, res) => {
  const { bookedSeat, booking, billing, passengers, payment } = req.body;

  // Log input
  console.log('completeIrctcBooking input:', { bookedSeat, booking, billing, passengers, payment });

  // Validation
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

  const bookingFields = [
    'pnr',
    'bookingNo',
    'contact_no',
    'email_id',
    'noOfPassengers',
    'totalFare',
    'bookedUserId',
    'schedule_id',
    'bookDate',
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
    'payment_mode',
    'transaction_id',
  ];
  for (const f of paymentFields) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }

  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }

  if (!['IRCTC_GATEWAY', 'UPI', 'NET_BANKING'].includes(payment.payment_mode)) {
    return res.status(400).json({ error: 'Invalid payment_mode. Must be IRCTC_GATEWAY, UPI, or NET_BANKING' });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      // Check available seats
      const seatsLeft = await sumSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });
      console.log('Seats left:', seatsLeft);
      if (seatsLeft < bookedSeat.booked_seat) {
        throw new Error(
          `Only ${seatsLeft} seat(s) left on ${bookedSeat.bookDate} for schedule ${bookedSeat.schedule_id}`
        );
      }

      // Update or create booked seat record
      const [row, created] = await models.BookedSeat.findOrCreate({
        where: { schedule_id: bookedSeat.schedule_id, bookDate: bookedSeat.bookDate },
        defaults: { booked_seat: bookedSeat.booked_seat },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      console.log('findOrCreate:', { created, row: row.toJSON() });

      if (!row.isNewRecord) {
        await row.increment({ booked_seat: bookedSeat.booked_seat }, { transaction: t });
        console.log('After increment:', row.toJSON());
      }

      // Process IRCTC payment (simplified for this example)
      const paymentStatus = 'SUCCESS'; // In real implementation, this would involve IRCTC payment gateway API
      const paymentDetails = {
        ...payment,
        payment_status: paymentStatus,
        payment_id: `IRCTC-PAY-${uuidv4().slice(0, 8)}`,
        order_id: `IRCTC-ORDER-${uuidv4().slice(0, 8)}`,
        pay_mode: payment.payment_mode, // Map to Booking model field
        pay_amt: payment.payment_amount.toString(), // Map to Booking model field
      };

      // Create booking
      const newBooking = await models.Booking.create(
        {
          ...booking,
          bookingStatus: 'CONFIRMED',
          paymentStatus: paymentStatus,
          bookingNo: booking.bookingNo || `IRCTC-BOOK-${uuidv4().slice(0, 8)}`,
          pay_mode: payment.payment_mode,
          pay_amt: payment.payment_amount.toString(),
          paymentId: paymentDetails.payment_id,
          transactionId: payment.transaction_id,
        },
        { transaction: t }
      );

      // Create billing record
      await models.Billing.create(
        { ...billing, user_id: booking.bookedUserId },
        { transaction: t }
      );

      // Create payment record
      await models.Payment.create(
        { ...paymentDetails, booking_id: newBooking.id, user_id: booking.bookedUserId },
        { transaction: t }
      );

      // Create passenger records
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

      // Get updated seat counts
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

      result = { bookingId: newBooking.id, updatedSeatCounts, bookingNo: newBooking.bookingNo };
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('completeIrctcBooking error:', err);
    return res.status(400).json({ error: err.message });
  }
};










exports.completeBooking = async (req, res) => {
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  // Log input
  console.log('completeBooking input:', { bookedSeat, booking, billing, payment, passengers });

  // Validation
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
  ];
  for (const f of paymentFields) {
    if (!payment[f]) return res.status(400).json({ error: `Missing payment field: ${f}` });
  }

  for (const p of passengers) {
    if (!p.name || !p.title || !p.type || typeof p.age !== 'number') {
      return res.status(400).json({ error: 'Missing passenger fields: name, title, type, age' });
    }
  }

  if (!['RAZORPAY', 'ADMIN'].includes(payment.payment_mode)) {
    return res.status(400).json({ error: 'Invalid payment_mode. Must be RAZORPAY or ADMin' });
  }

  try {
    let result;
    await models.sequelize.transaction(async (t) => {
      if (payment.payment_mode === 'RAZORPAY') {
        const ok = await verifyPayment({
          order_id: payment.order_id,
          payment_id: payment.payment_id,
          signature: payment.razorpay_signature,
        });
        if (!ok) throw new Error('Invalid Razorpay signature');
      } else if (payment.payment_mode === 'DUMMY') {
        payment.payment_status = 'SUCCESS';
        payment.transaction_id = `TXN-DUMMY-${Date.now()}`;
        payment.payment_id = `PAY-DUMMY-${Date.now()}`;
        payment.order_id = `ORDER-DUMMY-${Date.now()}`;
      }

      const seatsLeft = await sumSeats({
        models,
        schedule_id: bookedSeat.schedule_id,
        bookDate: bookedSeat.bookDate,
        transaction: t,
      });
      console.log('Seats left:', seatsLeft);
      if (seatsLeft < bookedSeat.booked_seat) {
        throw new Error(
          `Only ${seatsLeft} seat(s) left on ${bookedSeat.bookDate} for schedule ${bookedSeat.schedule_id}`
        );
      }

      const [row, created] = await models.BookedSeat.findOrCreate({
        where: { schedule_id: bookedSeat.schedule_id, bookDate: bookedSeat.bookDate },
        defaults: { booked_seat: bookedSeat.booked_seat },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      console.log('findOrCreate:', { created, row: row.toJSON() });

      if (!row.isNewRecord) {
        await row.increment({ booked_seat: bookedSeat.booked_seat }, { transaction: t });
        console.log('After increment:', row.toJSON());
      }

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

      result = { bookingId: newBooking.id, updatedSeatCounts, bookingNo: newBooking.bookingNo };
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error('completeBooking error:', err);
    return res.status(400).json({ error: err.message });
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




exports.getBookingSummary = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== "All Booking") {
      where.bookingStatus = status.toUpperCase();
    }
    // Sum number of passengers
    const totalSeats = await models.Booking.sum("noOfPassengers", { where });
    // Count total bookings
    const totalBookings = await models.Booking.count({ where });

    return res.json({ totalBookings, totalSeats: totalSeats || 0 });
  } catch (err) {
    console.error("Error fetching booking summary:", err);
    res.status(500).json({ error: "Server error" });
  }
};