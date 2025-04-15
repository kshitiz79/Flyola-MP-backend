// src/controller/bookingController.js
const { verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');

const getModels = () => require('../model');

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

async function getWrappedScheduleIds(models, schedule_id) {
  const schedule = await models.FlightSchedule.findByPk(schedule_id);
  if (!schedule) throw new Error('Schedule not found');
  const wrappedIds = schedule.via_schedule_id ? JSON.parse(schedule.via_schedule_id) : [];
  return [schedule_id, ...wrappedIds];
}

async function sumSeats({ models, schedule_id, bookDate, transaction }) {
  return (
    (await models.BookedSeat.sum('booked_seat', {
      where: { schedule_id, bookDate },
      transaction,
    })) || 0
  );
}

const completeBooking = async (req, res) => {
  const models = getModels();
  const { bookedSeat, booking, billing, payment, passengers } = req.body;

  if (!bookedSeat || !booking || !billing || !payment || !passengers?.length) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  let transaction;
  try {
    transaction = await models.sequelize.transaction();

    const schedule = await models.FlightSchedule.findByPk(bookedSeat.schedule_id, {
      include: [{ model: models.Flight }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!schedule) throw new Error('Flight schedule not found');
    if (!schedule.Flight) throw new Error('Associated flight not found');

    const flight = schedule.Flight;
    const alreadyBooked = await sumSeats({
      models,
      schedule_id: bookedSeat.schedule_id,
      bookDate: bookedSeat.bookDate,
      transaction,
    });
    const remaining = flight.seat_limit - alreadyBooked;
    if (remaining < bookedSeat.booked_seat) {
      throw new Error(
        `Only ${remaining} seat(s) left on ${bookedSeat.bookDate}. Please reduce passengers.`
      );
    }

    if (payment.payment_mode === 'RAZORPAY') {
      const ok = await verifyPayment(
        payment.payment_id,
        payment.order_id,
        payment.razorpay_signature
      );
      if (!ok) throw new Error('Payment verification failed');
    }

    const newBookedSeat = await models.BookedSeat.create(bookedSeat, { transaction });
    const newBooking = await models.Booking.create(
      { ...booking, paymentStatus: 'PENDING', bookingStatus: 'PENDING' },
      { transaction }
    );
    await models.Billing.create(
      {
        ...billing,
        user_id: booking.bookedUserId,
      },
      { transaction }
    );
    await createPaymentUtil({ ...payment, booking_id: newBooking.id }, transaction);

    await Promise.all(
      passengers.map((p) =>
        models.Passenger.create(
          {
            name: p.fullName,
            age: p.age,
            dob: p.dateOfBirth,
            title: p.title,
            type: p.type || 'Adult',
            bookingId: newBooking.id,
          },
          { transaction }
        )
      )
    );

    await models.Booking.update(
      { paymentStatus: 'PAYMENT_SUCCESS', bookingStatus: 'CONFIRMED' },
      { where: { id: newBooking.id }, transaction }
    );

    await transaction.commit();

    const updatedSeats = remaining - bookedSeat.booked_seat;
    res.status(201).json({
      bookingId: newBooking.id,
      schedule_id: bookedSeat.schedule_id,
      bookDate: bookedSeat.bookDate,
      updatedAvailableSeats: updatedSeats,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error('completeBooking:', err);
    res.status(400).json({ error: err.message });
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

    // Optionally fetch billing details separately
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
    // Cannot delete Billing without bookingId; skip or use user_id cautiously
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