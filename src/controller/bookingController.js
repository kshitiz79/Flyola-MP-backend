const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');

const getModels = () => require('../model');

async function getWrappedScheduleIds(models, schedule_id) {
  if (!models.FlightSchedule) throw new Error('FlightSchedule model is undefined');
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule) throw new Error('Schedule not found');

  const flight = schedule.Flight;
  let routeAirports;
  try {
    routeAirports = flight.airport_stop_ids
      ? JSON.parse(flight.airport_stop_ids)
      : [flight.start_airport_id, flight.end_airport_id];
    if (!Array.isArray(routeAirports) || routeAirports.length === 0 || routeAirports.includes(0)) {
      console.warn(
        `getWrappedScheduleIds - Invalid airport_stop_ids for flight ${flight.id}: ${flight.airport_stop_ids}. ` +
        `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
      );
      routeAirports = [flight.start_airport_id, flight.end_airport_id];
    }
  } catch (err) {
    console.error(
      `getWrappedScheduleIds - Error parsing airport_stop_ids for flight ${flight.id}: ${err.message}. ` +
      `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
    );
    routeAirports = [flight.start_airport_id, flight.end_airport_id];
  }

  console.log(
    `getWrappedScheduleIds - Schedule ${schedule_id}, flight_id=${flight.id}, ` +
    `routeAirports=${JSON.stringify(routeAirports)}, ` +
    `departure_airport_id=${schedule.departure_airport_id}, ` +
    `arrival_airport_id=${schedule.arrival_airport_id}`
  );

  const segmentStartIndex = routeAirports.indexOf(schedule.departure_airport_id);
  const segmentEndIndex = routeAirports.indexOf(schedule.arrival_airport_id);
  if (segmentStartIndex === -1 || segmentEndIndex === -1 || segmentStartIndex >= segmentEndIndex) {
    console.warn(
      `getWrappedScheduleIds - Invalid segment for schedule ${schedule_id}, ` +
      `startIndex=${segmentStartIndex}, endIndex=${segmentEndIndex}. Returning [${schedule_id}]`
    );
    return [schedule_id];
  }

  if (segmentStartIndex + 1 === segmentEndIndex) {
    console.log(`getWrappedScheduleIds - Direct flight, returning schedule_id: ${schedule_id}`);
    return [schedule_id];
  }

  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
  });

  const affectedSchedules = allSchedules.filter((s) => {
    const startIndex = routeAirports.indexOf(s.departure_airport_id);
    const endIndex = routeAirports.indexOf(s.arrival_airport_id);
    const isOverlapping =
      startIndex !== -1 &&
      endIndex !== -1 &&
      startIndex <= segmentStartIndex &&
      endIndex >= segmentEndIndex &&
      startIndex < endIndex;
    console.log(
      `getWrappedScheduleIds - Schedule ${s.id}, startIndex=${startIndex}, endIndex=${endIndex}, ` +
      `isOverlapping=${isOverlapping}, departure=${s.departure_airport_id}, arrival=${s.arrival_airport_id}`
    );
    return isOverlapping;
  });

  const affectedScheduleIds = affectedSchedules.map((s) => s.id);
  console.log(`getWrappedScheduleIds - Affected schedules:`, affectedScheduleIds);
  return affectedScheduleIds.length > 0 ? affectedScheduleIds : [schedule_id];
}

async function sumSeats({ models, schedule_id, bookDate, transaction }) {
  if (!models.FlightSchedule || !models.BookedSeat) {
    throw new Error('FlightSchedule or BookedSeat model is undefined');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate)) {
    console.error(`sumSeats - Invalid bookDate format: ${bookDate}`);
    return 0;
  }

  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
  });
  if (!schedule || !schedule.Flight) {
    console.error(`sumSeats - Schedule ${schedule_id} or Flight not found`);
    return 0;
  }

  const flight = schedule.Flight;
  let routeAirports;
  try {
    routeAirports = flight.airport_stop_ids
      ? JSON.parse(flight.airport_stop_ids)
      : [flight.start_airport_id, flight.end_airport_id];
    if (!Array.isArray(routeAirports) || routeAirports.length === 0 || routeAirports.includes(0)) {
      console.warn(
        `sumSeats - Invalid airport_stop_ids for flight ${flight.id}: ${flight.airport_stop_ids}. ` +
        `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
      );
      routeAirports = [flight.start_airport_id, flight.end_airport_id];
    }
  } catch (err) {
    console.error(
      `sumSeats - Error parsing airport_stop_ids for flight ${flight.id}: ${err.message}. ` +
      `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
    );
    routeAirports = [flight.start_airport_id, flight.end_airport_id];
  }

  console.log(
    `sumSeats - Schedule ${schedule_id}, flight_id=${flight.id}, ` +
    `seat_limit=${flight.seat_limit}, routeAirports=${JSON.stringify(routeAirports)}, ` +
    `departure_airport_id=${schedule.departure_airport_id}, ` +
    `arrival_airport_id=${schedule.arrival_airport_id}`
  );

  const segmentStartIndex = routeAirports.indexOf(schedule.departure_airport_id);
  const segmentEndIndex = routeAirports.indexOf(schedule.arrival_airport_id);

  if (segmentStartIndex === -1 || segmentEndIndex === -1 || segmentStartIndex >= segmentEndIndex) {
    console.warn(
      `sumSeats - Invalid segment indices for schedule ${schedule_id}, ` +
      `startIndex=${segmentStartIndex}, endIndex=${segmentEndIndex}. Using direct segment`
    );
    const bookedSeat = await models.BookedSeat.findOne({
      where: { schedule_id, bookDate },
      transaction,
    });
    const totalBooked = bookedSeat ? bookedSeat.booked_seat || 0 : 0;
    const seatsLeft = flight.seat_limit - totalBooked;
    console.log(
      `sumSeats - Direct segment, schedule ${schedule_id}, bookDate=${bookDate}, ` +
      `totalBooked=${totalBooked}, seatsLeft=${seatsLeft}, found=${!!bookedSeat}`
    );
    return Math.max(0, seatsLeft);
  }

  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
  });

  const overlappingSchedules = allSchedules.filter((s) => {
    const startIndex = routeAirports.indexOf(s.departure_airport_id);
    const endIndex = routeAirports.indexOf(s.arrival_airport_id);
    const isOverlapping =
      startIndex !== -1 &&
      endIndex !== -1 &&
      startIndex <= segmentStartIndex &&
      endIndex >= segmentEndIndex &&
      startIndex < endIndex;
    console.log(
      `sumSeats - Schedule ${s.id}, startIndex=${startIndex}, endIndex=${endIndex}, ` +
      `isOverlapping=${isOverlapping}, departure=${s.departure_airport_id}, arrival=${s.arrival_airport_id}`
    );
    return isOverlapping;
  });

  let totalBooked = 0;
  const bookedDetails = [];
  for (const s of overlappingSchedules) {
    const bookedSeat = await models.BookedSeat.findOne({
      where: { schedule_id: s.id, bookDate },
      transaction,
    });
    const booked = bookedSeat ? bookedSeat.booked_seat || 0 : 0;
    bookedDetails.push({ schedule_id: s.id, booked_seat: booked, found: !!bookedSeat });
    totalBooked = Math.max(totalBooked, booked);
    console.log(
      `sumSeats - Schedule ${s.id}, bookDate=${bookDate}, booked=${booked}, ` +
      `found=${!!bookedSeat}`
    );
  }

  const seatsLeft = flight.seat_limit - totalBooked;
  console.log(
    `sumSeats - Schedule ${schedule_id}, bookDate=${bookDate}, ` +
    `seat_limit=${flight.seat_limit}, totalBooked=${totalBooked}, seatsLeft=${seatsLeft}, ` +
    `bookedDetails=`, bookedDetails
  );

  return Math.max(0, seatsLeft);
}

const completeBooking = async (req, res) => {
  const models = getModels();
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  // 1️⃣ Ensure all models exist
  const requiredModels = [
    'Booking', 'BookedSeat', 'Billing', 'Payment',
    'Passenger', 'User', 'FlightSchedule'
  ];
  for (const name of requiredModels) {
    if (!models[name]) {
      console.error(`completeBooking - Model ${name} is undefined`);
      return res.status(500).json({ error: `Model ${name} is not defined` });
    }
  }

  // 2️⃣ Basic payload presence checks
  if (!bookedSeat || !booking || !billing || !payment || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({
      error: 'Missing required data: bookedSeat, booking, billing, payment, passengers'
    });
  }

  // 3️⃣ bookedSeat format
  if (!bookedSeat.schedule_id || !bookedSeat.bookDate || !bookedSeat.booked_seat) {
    return res.status(400).json({
      error: 'Missing required bookedSeat fields: schedule_id, bookDate, booked_seat'
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedSeat.bookDate)) {
    return res.status(400).json({ error: 'Invalid bookDate format. Use YYYY-MM-DD' });
  }

  // 4️⃣ booking fields
  if (!booking.pnr ||
      !booking.bookingNo ||
      !booking.contact_no ||
      !booking.email_id ||
      !booking.noOfPassengers ||
      !booking.totalFare ||
      !booking.bookedUserId ||
      !booking.schedule_id
  ) {
    return res.status(400).json({
      error: 'Missing required booking fields: pnr, bookingNo, contact_no, email_id, noOfPassengers, totalFare, bookedUserId, schedule_id'
    });
  }

  // 5️⃣ billing fields
  if (!billing.user_id) {
    return res.status(400).json({ error: 'Missing required billing field: user_id' });
  }

  // 6️⃣ payment fields
  if (!payment.user_id ||
      !payment.payment_amount ||
      !payment.payment_status ||
      !payment.transaction_id ||
      !payment.payment_id ||
      !payment.payment_mode ||
      !payment.order_id ||
      !payment.razorpay_signature
  ) {
    return res.status(400).json({
      error: 'Missing required payment fields: user_id, payment_amount, payment_status, transaction_id, payment_id, payment_mode, order_id, razorpay_signature'
    });
  }

  // 7️⃣ Strict passenger validation
  for (const p of passengers) {
    if (
      typeof p.fullName !== 'string' ||
      typeof p.age !== 'number' ||
      typeof p.title !== 'string' ||
      typeof p.type !== 'string' ||
      p.fullName.trim() === '' ||
      p.title.trim() === ''
    ) {
      return res.status(400).json({
        error: 'Missing required passenger fields: fullName, age, title, type'
      });
    }
  }

  // 8️⃣ Validate payment_mode
  if (payment.payment_mode !== 'RAZORPAY') {
    return res.status(400).json({
      error: 'Invalid payment_mode. Must be RAZORPAY'
    });
  }

  // 9️⃣ Verify Razorpay payment
  try {
    const isValid = await verifyPayment({
      order_id: payment.order_id,
      payment_id: payment.payment_id,
      signature: payment.razorpay_signature,
    });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Razorpay payment signature' });
    }
  } catch (err) {
    console.error('Razorpay verification error:', err);
    return res.status(400).json({ error: 'Failed to verify Razorpay payment' });
  }

  // 10️⃣ Prepare normalized bookingData
  const bookingData = {
    ...booking,
    bookDate: booking.bookDate || bookedSeat.bookDate,
    paymentStatus: booking.paymentStatus || payment.payment_status || 'SUCCESS',
    bookingStatus: booking.bookingStatus || 'CONFIRMED',
    discount: booking.discount || '0',
    agent_type: booking.agent_type || 'flyola',
    pay_amt: booking.pay_amt || String(payment.payment_amount),
    pay_mode: booking.pay_mode || payment.payment_mode,
    transactionId: booking.transactionId || payment.transaction_id,
    paymentId: booking.paymentId || payment.payment_id,
  };
  if (!bookingData.bookDate) {
    return res.status(400).json({ error: 'booking.bookDate is required' });
  }

  let transaction;
  let committed = false;
  try {
    transaction = await models.sequelize.transaction();

    // 11️⃣ Foreign-key checks
    const user = await models.User.findByPk(booking.bookedUserId, { transaction });
    if (!user) throw new Error(`User ${booking.bookedUserId} not found`);
    const schedule = await models.FlightSchedule.findByPk(booking.schedule_id, { transaction });
    if (!schedule) throw new Error(`Schedule ${booking.schedule_id} not found`);

    // 12️⃣ Check seat availability across wrapped segments
    const affectedScheduleIds = await getWrappedScheduleIds(models, bookedSeat.schedule_id);
    for (const sid of affectedScheduleIds) {
      const seatsLeft = await sumSeats({
        models,
        schedule_id: sid,
        bookDate: bookedSeat.bookDate,
        transaction
      });
      if (seatsLeft < bookedSeat.booked_seat) {
        throw new Error(`Only ${seatsLeft} seat(s) left on ${bookedSeat.bookDate} for schedule ${sid}.`);
      }
    }

    // 13️⃣ Create or update BookedSeat rows
    await Promise.all(affectedScheduleIds.map(async (sid) => {
      const existing = await models.BookedSeat.findOne({
        where: { schedule_id: sid, bookDate: bookedSeat.bookDate },
        transaction
      });
      if (existing) {
        await existing.update(
          { booked_seat: existing.booked_seat + bookedSeat.booked_seat },
          { transaction }
        );
      } else {
        await models.BookedSeat.create({
          schedule_id: sid,
          bookDate: bookedSeat.bookDate,
          booked_seat: bookedSeat.booked_seat
        }, { transaction });
      }
    }));

    // 14️⃣ Create Booking, Billing, Payment, Passenger rows
    const newBooking = await models.Booking.create(bookingData, { transaction });
    await models.Billing.create({ ...billing, user_id: booking.bookedUserId }, { transaction });
    await createPaymentUtil(
      { ...payment, booking_id: newBooking.id, user_id: booking.bookedUserId },
      transaction
    );
    await Promise.all(passengers.map(p => models.Passenger.create({
      bookingId: newBooking.id,
      title: p.title,
      name: p.fullName,
      dob: p.dateOfBirth,
      age: p.age,
      type: p.type
    }, { transaction })));

    // 15️⃣ Update booking status
    await models.Booking.update(
      { paymentStatus: 'SUCCESS', bookingStatus: 'CONFIRMED' },
      { where: { id: newBooking.id }, transaction }
    );

    await transaction.commit();
    committed = true;

    // 16️⃣ Compute updated seat counts for response
    const updatedSeatCounts = await models.sequelize.transaction(async (t) => {
      return Promise.all(affectedScheduleIds.map(async (sid) => {
        const seatsLeft = await sumSeats({
          models,
          schedule_id: sid,
          bookDate: bookedSeat.bookDate,
          transaction: t
        });
        return { schedule_id: sid, bookDate: bookedSeat.bookDate, seatsLeft };
      }));
    });

    return res.status(201).json({
      bookingId: newBooking.id,
      schedule_id: bookedSeat.schedule_id,
      bookDate: bookedSeat.bookDate,
      booked_seat: bookedSeat.booked_seat,
      updatedSeatCounts
    });
  } catch (err) {
    if (transaction && !committed) {
      try { await transaction.rollback(); } catch (_) {}
    }
    console.error('completeBooking - Error:', err);
    return res.status(400).json({
      error: err.message,
      details: err.errors?.map(e => ({
        field: e.path, message: e.message, value: e.value
      })) || []
    });
  }
};







const getBookings = async (req, res) => {
  const models = getModels();
  try {
    const bookings = await models.Booking.findAll({
      include: [
        { model: models.BookedSeat, required: false },
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        { model: models.Payment, required: false },
      ],
    });

    const bookingsWithBilling = await Promise.all(
      bookings.map(async (booking) => {
        const billing = await models.Billing.findOne({
          where: { user_id: booking.bookedUserId },
        });
        return {
          ...booking.toJSON(),
          billing: billing ? billing.toJSON() : null,
        };
      })
    );

    res.json(bookingsWithBilling);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

const getBookingById = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id, {
      include: [
        { model: models.BookedSeat, required: false },
        { model: models.Passenger, required: false },
        { model: models.FlightSchedule, required: false },
        { model: models.Payment, required: false },
      ],
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const billing = await models.Billing.findOne({
      where: { user_id: booking.bookedUserId },
    });

    res.json({
      ...booking.toJSON(),
      billing: billing ? billing.toJSON() : null,
    });
  } catch (err) {
    console.error('Error fetching booking:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

const createBooking = async (req, res) => {
  const models = getModels();
  try {
    const booking = await models.Booking.create(req.body);
    res.status(201).json(booking);
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(400).json({ error: err.message });
  }
};

const updateBooking = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await booking.update(req.body);
    res.json({ message: 'Booking updated successfully', booking });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(400).json({ error: err.message });
  }
};

const deleteBooking = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  let transaction;
  try {
    transaction = await models.sequelize.transaction();
    const booking = await models.Booking.findByPk(id, { transaction });
    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    await models.BookedSeat.destroy({
      where: { schedule_id: booking.schedule_id },
      transaction,
    });
    await models.Passenger.destroy({
      where: { bookingId: booking.id },
      transaction,
    });
    await models.Payment.destroy({
      where: { booking_id: booking.id },
      transaction,
    });
    await booking.destroy({ transaction });

    await transaction.commit();
    res.json({ message: 'Booking deleted successfully' });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  completeBooking,
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
};