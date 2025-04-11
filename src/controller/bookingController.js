const getModels = () => require('../model'); // Lazy-load models

// Helper function to calculate next weekday (borrowed from flightController.js)
function getNextWeekday(weekday) {
  const weekdayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const now = new Date();
  const currentDay = now.getDay();
  const targetDay = weekdayMap[weekday];
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysToAdd);
  return nextDate;
}

const completeBooking = async (req, res) => {
  const models = getModels();
  console.log('Received complete-booking request:', req.body);

  const { bookedSeat, booking, billing, payment } = req.body;

  if (!bookedSeat || !booking || !billing || !payment) {
    return res.status(400).json({ error: 'Missing required data: bookedSeat, booking, billing, payment' });
  }

  if (!models.sequelize) {
    console.error('Sequelize instance is undefined');
    return res.status(500).json({ error: 'Database configuration error' });
  }

  let transaction;
  try {
    transaction = await models.sequelize.transaction();

    // Step 1: Validate schedule and seat availability
    const schedule = await models.FlightSchedule.findByPk(bookedSeat.schedule_id, {
      include: [{ model: models.Flight }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!schedule) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    const flight = schedule.Flight;
    const bookedSeats = (await models.BookedSeat.sum('booked_seat', {
      where: { schedule_id: bookedSeat.schedule_id },
      transaction,
    })) || 0;
    const availableSeats = flight.seat_limit - bookedSeats;
    if (availableSeats < bookedSeat.booked_seat) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Not enough seats available. Requested: ${bookedSeat.booked_seat}, Available: ${availableSeats}`,
      });
    }

    // Step 2: Validate bookDate against Flight.departure_day
    const nextFlightDate = getNextWeekday(flight.departure_day);
    const bookDate = new Date(bookedSeat.bookDate);
    if (
      bookDate.getDate() !== nextFlightDate.getDate() ||
      bookDate.getMonth() !== nextFlightDate.getMonth() ||
      bookDate.getFullYear() !== nextFlightDate.getFullYear()
    ) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Booking date ${bookedSeat.bookDate} does not match flight schedule (${flight.departure_day})`,
      });
    }

    // Step 3: Create records
    const newBookedSeat = await models.BookedSeat.create(
      {
        bookDate: bookedSeat.bookDate,
        schedule_id: bookedSeat.schedule_id,
        booked_seat: bookedSeat.booked_seat,
      },
      { transaction }
    );

    const newBooking = await models.Booking.create(
      {
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        contact_no: booking.contact_no,
        email_id: booking.email_id,
        noOfPassengers: booking.noOfPassengers,
        bookDate: booking.bookDate,
        schedule_id: booking.schedule_id,
        totalFare: booking.totalFare,
        paymentStatus: 'PENDING',
        bookingStatus: 'PENDING',
        bookedUserId: booking.bookedUserId,
      },
      { transaction }
    );

    const newBilling = await models.Billing.create(
      {
        billing_name: billing.billing_name,
        billing_email: billing.billing_email,
        billing_number: billing.billing_number,
        billing_address: billing.billing_address,
        billing_country: billing.billing_country,
        billing_state: billing.billing_state,
        billing_pin_code: billing.billing_pin_code,
        GST_Number: billing.GST_Number || null,
        user_id: billing.user_id,
      },
      { transaction }
    );

    const newPayment = await models.Payment.create(
      {
        transaction_id: payment.transaction_id,
        payment_id: payment.payment_id,
        payment_status: payment.payment_status,
        payment_mode: payment.payment_mode,
        payment_amount: payment.payment_amount,
        message: payment.message,
        booking_id: newBooking.id,
        user_id: payment.user_id,
      },
      { transaction }
    );

    await models.Booking.update(
      { paymentStatus: 'PAYMENT_SUCCESS', bookingStatus: 'CONFIRMED' },
      { where: { id: newBooking.id }, transaction }
    );

    await transaction.commit();
    res.status(201).json({
      bookedSeat: newBookedSeat,
      booking: newBooking,
      billing: newBilling,
      payment: newPayment,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error('Error completing booking:', err);
    res.status(500).json({ error: err.message });
  }
};

const getBookings = async (req, res) => {
  const models = getModels();
  try {
    const bookings = await models.Booking.findAll();
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
};

const getBookingById = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
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
    res.status(500).json({ error: err.message });
  }
};

const updateBooking = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await booking.update(req.body);
    res.json({ message: 'Booking updated successfully' });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ error: err.message });
  }
};

const deleteBooking = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const booking = await models.Booking.findByPk(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await booking.destroy();
    res.json({ message: 'Booking deleted successfully' });
  } catch (err) {
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