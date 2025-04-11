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
    return res.status(400).json({ error: 'Missing required data' });
  }

  if (!models.sequelize) {
    console.error('Sequelize instance is undefined');
    return res.status(500).json({ error: 'Database configuration error' });
  }

  let transaction;
  try {
    transaction = await models.sequelize.transaction();

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
      return res.status(400).json({ error: `Not enough seats available` });
    }

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

    // Verify Razorpay payment
    const { payment_id, order_id, razorpay_signature } = payment;
    if (payment.payment_mode === 'RAZORPAY') {
      const isValid = await verifyPayment(payment_id, order_id, razorpay_signature);
      if (!isValid) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Payment verification failed' });
      }
    }

    const newBookedSeat = await models.BookedSeat.create(bookedSeat, { transaction });
    const newBooking = await models.Booking.create(
      { ...booking, paymentStatus: 'PENDING', bookingStatus: 'PENDING' },
      { transaction }
    );
    const newBilling = await models.Billing.create(billing, { transaction });
    const newPayment = await createPaymentUtil(
      { ...payment, booking_id: newBooking.id },
      transaction
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