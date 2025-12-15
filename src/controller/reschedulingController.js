const models = require('../model');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { sumSeats } = require('../utils/seatUtils');
const { razorpay } = require('../utils/razorpay');
const crypto = require('crypto');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Get rescheduling details for a booking
 * Shows available schedules, pricing, and rescheduling fees
 */
const getReschedulingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { bookingType, date } = req.query; // 'flight' or 'helicopter', and optional date

    let booking;
    let scheduleModel;
    let bookingModel;
    let bookedSeatModel;

    if (bookingType === 'helicopter') {
      bookingModel = models.HelicopterBooking;
      scheduleModel = models.HelicopterSchedule;
      bookedSeatModel = models.HelicopterBookedSeat;
      
      booking = await bookingModel.findByPk(bookingId, {
        include: [
          { 
            model: models.HelicopterSchedule,
            include: [
              { model: models.Helipad, as: 'DepartureLocation' },
              { model: models.Helipad, as: 'ArrivalLocation' }
            ]
          },
          { model: models.HelicopterPassenger, as: 'Passengers' },
          { model: models.HelicopterBookedSeat, as: 'BookedSeats' }
        ]
      });
    } else {
      bookingModel = models.Booking;
      scheduleModel = models.FlightSchedule;
      bookedSeatModel = models.BookedSeat;
      
      booking = await bookingModel.findByPk(bookingId, {
        include: [
          { 
            model: models.FlightSchedule,
            include: [
              { model: models.Airport, as: 'DepartureAirport' },
              { model: models.Airport, as: 'ArrivalAirport' }
            ]
          },
          { model: models.Passenger },
          { model: models.BookedSeat }
        ]
      });
    }

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if booking can be rescheduled
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'SUCCESS') {
      return res.status(400).json({ 
        error: 'Only confirmed bookings can be rescheduled',
        currentStatus: booking.bookingStatus
      });
    }

    // Calculate rescheduling fee (10% of total fare)
    const reschedulingFee = parseFloat(booking.totalFare) * 0.10;

    // Get available schedules for the same route
    let currentSchedule = bookingType === 'helicopter' 
      ? booking.HelicopterSchedule 
      : booking.FlightSchedule;

    // Fallback: manually fetch schedule if not loaded via association
    if (!currentSchedule && booking.schedule_id) {
      console.log('Schedule not loaded via association, fetching manually for schedule_id:', booking.schedule_id);
      if (bookingType === 'helicopter') {
        currentSchedule = await models.HelicopterSchedule.findByPk(booking.helicopter_schedule_id, {
          include: [
            { model: models.Helipad, as: 'DepartureLocation' },
            { model: models.Helipad, as: 'ArrivalLocation' }
          ]
        });
      } else {
        currentSchedule = await models.FlightSchedule.findByPk(booking.schedule_id, {
          include: [
            { model: models.Airport, as: 'DepartureAirport' },
            { model: models.Airport, as: 'ArrivalAirport' }
          ]
        });
      }
    }

    if (!currentSchedule) {
      return res.status(400).json({ 
        error: 'Cannot reschedule: Original flight schedule not found',
        scheduleId: booking.schedule_id
      });
    }

    console.log('Current booking schedule:', {
      scheduleId: currentSchedule?.id,
      departureAirportId: currentSchedule?.departure_airport_id,
      arrivalAirportId: currentSchedule?.arrival_airport_id,
      departureHelipadId: currentSchedule?.departure_helipad_id,
      arrivalHelipadId: currentSchedule?.arrival_helipad_id,
      hasDepartureAirport: !!currentSchedule?.DepartureAirport,
      hasArrivalAirport: !!currentSchedule?.ArrivalAirport
    });

    // Build where clause based on booking type
    const whereClause = bookingType === 'helicopter'
      ? {
          departure_helipad_id: currentSchedule.departure_helipad_id,
          arrival_helipad_id: currentSchedule.arrival_helipad_id,
          status: 1
        }
      : {
          departure_airport_id: currentSchedule.departure_airport_id,
          arrival_airport_id: currentSchedule.arrival_airport_id,
          status: 1
        };

    console.log('Where clause for schedules:', whereClause);

    const availableSchedules = await scheduleModel.findAll({
      where: whereClause,
      include: bookingType === 'helicopter' 
        ? [
            { model: models.Helipad, as: 'DepartureLocation' },
            { model: models.Helipad, as: 'ArrivalLocation' },
            { model: models.Helicopter, as: 'Helicopter' }
          ]
        : [
            { model: models.Airport, as: 'DepartureAirport' },
            { model: models.Airport, as: 'ArrivalAirport' },
            { model: models.Flight }
          ]
    });

    console.log(`Found ${availableSchedules.length} schedules for the route`);

    // If date is provided, calculate actual available seats for that date
    const selectedDate = date || booking.bookDate;
    console.log('Calculating availability for date:', selectedDate);

    // Get the weekday for the selected date to filter schedules
    const selectedWeekday = dayjs(selectedDate).format('dddd'); // e.g., "Saturday"
    console.log('Selected weekday:', selectedWeekday);

    // Filter schedules that operate on the selected weekday
    const schedulesForWeekday = availableSchedules.filter(schedule => {
      if (bookingType === 'helicopter') {
        // For helicopters, check if they have a departure_day field or operate daily
        const helicopter = schedule.Helicopter;
        if (!helicopter) return false;
        // If helicopter has departure_day, check it; otherwise assume it operates daily
        if (helicopter.departure_day) {
          return helicopter.departure_day === selectedWeekday;
        }
        return true; // Assume helicopters operate daily if no departure_day
      } else {
        // For flights, check the Flight's departure_day
        const flight = schedule.Flight;
        if (!flight) return false;
        
        // Handle one-time special flights
        if (schedule.is_one_time === 1) {
          return schedule.specific_date === selectedDate;
        }
        
        // Regular recurring flights - check weekday
        return flight.departure_day === selectedWeekday;
      }
    });

    console.log(`Filtered to ${schedulesForWeekday.length} schedules for ${selectedWeekday}`);
    
    const schedulesWithAvailability = await Promise.all(
      schedulesForWeekday.map(async (schedule) => {
        let totalSeats, actualAvailableSeats, bookedSeatsCount;

        if (bookingType === 'helicopter') {
          // For helicopters, use simple count method
          bookedSeatsCount = await bookedSeatModel.count({
            where: {
              helicopter_schedule_id: schedule.id,
              bookDate: selectedDate
            }
          });
          totalSeats = schedule.Helicopter?.seat_limit || schedule.available_seats || 0;
          actualAvailableSeats = Math.max(0, totalSeats - bookedSeatsCount);
        } else {
          // For flights, use the proper seatUtils that handles overlapping segments
          actualAvailableSeats = await sumSeats({
            models,
            schedule_id: schedule.id,
            bookDate: selectedDate
          });
          totalSeats = schedule.Flight?.seat_limit || 0;
          bookedSeatsCount = totalSeats - actualAvailableSeats;
        }

        console.log(`Schedule ${schedule.id}: total=${totalSeats}, booked=${bookedSeatsCount}, available=${actualAvailableSeats} for date ${selectedDate}`);

        // Get location details
        let departureLocation, arrivalLocation;
        if (bookingType === 'helicopter') {
          departureLocation = schedule.DepartureLocation;
          arrivalLocation = schedule.ArrivalLocation;
        } else {
          departureLocation = schedule.DepartureAirport;
          arrivalLocation = schedule.ArrivalAirport;
        }

        return {
          id: schedule.id,
          departureTime: schedule.departure_time,
          arrivalTime: schedule.arrival_time,
          price: schedule.price,
          totalSeats: totalSeats,
          bookedSeats: bookedSeatsCount,
          availableSeats: actualAvailableSeats,
          departureLocation: {
            id: departureLocation?.id,
            name: departureLocation?.city || departureLocation?.helipad_name,
            code: departureLocation?.airport_code || departureLocation?.helipad_code
          },
          arrivalLocation: {
            id: arrivalLocation?.id,
            name: arrivalLocation?.city || arrivalLocation?.helipad_name,
            code: arrivalLocation?.airport_code || arrivalLocation?.helipad_code
          }
        };
      })
    );

    // Get current booking route info - with fallback to manual fetch if needed
    let currentDepartureLocation, currentArrivalLocation;
    if (bookingType === 'helicopter') {
      currentDepartureLocation = currentSchedule.DepartureLocation;
      currentArrivalLocation = currentSchedule.ArrivalLocation;
      
      // Fallback: manually fetch if not loaded
      if (!currentDepartureLocation && currentSchedule.departure_helipad_id) {
        currentDepartureLocation = await models.Helipad.findByPk(currentSchedule.departure_helipad_id);
      }
      if (!currentArrivalLocation && currentSchedule.arrival_helipad_id) {
        currentArrivalLocation = await models.Helipad.findByPk(currentSchedule.arrival_helipad_id);
      }
    } else {
      currentDepartureLocation = currentSchedule.DepartureAirport;
      currentArrivalLocation = currentSchedule.ArrivalAirport;
      
      // Fallback: manually fetch if not loaded
      if (!currentDepartureLocation && currentSchedule.departure_airport_id) {
        currentDepartureLocation = await models.Airport.findByPk(currentSchedule.departure_airport_id);
        console.log('Manually fetched departure airport:', currentDepartureLocation?.city);
      }
      if (!currentArrivalLocation && currentSchedule.arrival_airport_id) {
        currentArrivalLocation = await models.Airport.findByPk(currentSchedule.arrival_airport_id);
        console.log('Manually fetched arrival airport:', currentArrivalLocation?.city);
      }
    }

    console.log('Current route locations:', {
      departure: currentDepartureLocation?.city || currentDepartureLocation?.helipad_name,
      arrival: currentArrivalLocation?.city || currentArrivalLocation?.helipad_name
    });

    return res.json({
      success: true,
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        currentScheduleId: currentSchedule.id,
        currentBookDate: booking.bookDate,
        totalFare: booking.totalFare,
        noOfPassengers: booking.noOfPassengers,
        bookingType: bookingType,
        currentRoute: {
          from: {
            id: currentDepartureLocation?.id,
            name: currentDepartureLocation?.city || currentDepartureLocation?.helipad_name,
            code: currentDepartureLocation?.airport_code || currentDepartureLocation?.helipad_code
          },
          to: {
            id: currentArrivalLocation?.id,
            name: currentArrivalLocation?.city || currentArrivalLocation?.helipad_name,
            code: currentArrivalLocation?.airport_code || currentArrivalLocation?.helipad_code
          }
        }
      },
      reschedulingFee,
      selectedDate,
      availableSchedules: schedulesWithAvailability,
      policy: {
        reschedulingFeePercentage: 10,
        minimumHoursBeforeDeparture: 24,
        note: 'Rescheduled bookings are non-refundable'
      }
    });

  } catch (error) {
    console.error('Error fetching rescheduling details:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch rescheduling details',
      message: error.message 
    });
  }
};

/**
 * Reschedule a flight booking
 */
const rescheduleFlightBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels } = req.body;
  
  let t;
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers.token || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Start transaction
    t = await models.sequelize.transaction();

    // Get booking with all details
    const booking = await models.Booking.findByPk(bookingId, {
      include: [
        { model: models.FlightSchedule },
        { model: models.Passenger },
        { model: models.BookedSeat },
        { model: models.User }
      ],
      transaction: t
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify ownership
    if (booking.bookedUserId !== userId) {
      await t.rollback();
      return res.status(403).json({ error: 'Unauthorized: You can only reschedule your own bookings' });
    }

    // Check booking status
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'SUCCESS') {
      await t.rollback();
      return res.status(400).json({ error: 'Only confirmed bookings can be rescheduled' });
    }

    // Check if rescheduling is allowed (24 hours before departure)
    const currentSchedule = booking.FlightSchedule;
    const departureDateTime = dayjs.tz(`${booking.bookDate} ${currentSchedule.departure_time}`, 'Asia/Kolkata');
    const now = dayjs.tz(new Date(), 'Asia/Kolkata');
    const hoursUntilDeparture = departureDateTime.diff(now, 'hour');

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({ 
        error: 'Rescheduling not allowed within 24 hours of departure',
        hoursUntilDeparture 
      });
    }

    // Get new schedule
    const newSchedule = await models.FlightSchedule.findByPk(newScheduleId, { transaction: t });
    if (!newSchedule) {
      await t.rollback();
      return res.status(404).json({ error: 'New schedule not found' });
    }

    // Calculate fees
    const originalFare = parseFloat(booking.totalFare);
    const newFare = parseFloat(newSchedule.price) * booking.noOfPassengers;
    const reschedulingFee = originalFare * 0.10; // 10% rescheduling fee
    const fareDifference = newFare - originalFare;
    const totalDeduction = reschedulingFee + (fareDifference > 0 ? fareDifference : 0);
    const newTotalFare = originalFare + totalDeduction;

    // Delete old booked seats
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction: t
    });

    // Create new booked seats
    for (const seatLabel of newSeatLabels) {
      await models.BookedSeat.create({
        booking_id: booking.id,
        schedule_id: newScheduleId,
        bookDate: newBookDate,
        seat_label: seatLabel,
        booked_seat: 1
      }, { transaction: t });
    }

    // Update booking
    await booking.update({
      schedule_id: newScheduleId,
      bookDate: newBookDate,
      totalFare: newTotalFare,
      bookingStatus: 'CONFIRMED'
    }, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: 'Flight booking rescheduled successfully',
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        newScheduleId,
        newBookDate,
        newSeats: newSeatLabels
      },
      charges: {
        originalFare,
        newFare,
        reschedulingFee,
        fareDifference,
        totalDeduction,
        newTotalFare
      },
      note: 'Rescheduled booking is non-refundable'
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error rescheduling flight booking:', error);
    return res.status(500).json({ 
      error: 'Failed to reschedule booking',
      message: error.message 
    });
  }
};

/**
 * Reschedule a helicopter booking
 */
const rescheduleHelicopterBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { newScheduleId, newBookDate, newSeatLabels } = req.body;
  
  let t;
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers.token || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Start transaction
    t = await models.sequelize.transaction();

    // Get booking with all details
    const booking = await models.HelicopterBooking.findByPk(bookingId, {
      include: [
        { model: models.HelicopterSchedule },
        { model: models.HelicopterPassenger, as: 'Passengers' },
        { model: models.HelicopterBookedSeat, as: 'BookedSeats' },
        { model: models.User }
      ],
      transaction: t
    });

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify ownership
    if (booking.bookedUserId !== userId) {
      await t.rollback();
      return res.status(403).json({ error: 'Unauthorized: You can only reschedule your own bookings' });
    }

    // Check booking status
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'SUCCESS') {
      await t.rollback();
      return res.status(400).json({ error: 'Only confirmed bookings can be rescheduled' });
    }

    // Check if rescheduling is allowed (24 hours before departure)
    const currentSchedule = booking.HelicopterSchedule;
    const departureDateTime = dayjs.tz(`${booking.bookDate} ${currentSchedule.departure_time}`, 'Asia/Kolkata');
    const now = dayjs.tz(new Date(), 'Asia/Kolkata');
    const hoursUntilDeparture = departureDateTime.diff(now, 'hour');

    if (hoursUntilDeparture < 24) {
      await t.rollback();
      return res.status(400).json({ 
        error: 'Rescheduling not allowed within 24 hours of departure',
        hoursUntilDeparture 
      });
    }

    // Get new schedule
    const newSchedule = await models.HelicopterSchedule.findByPk(newScheduleId, { transaction: t });
    if (!newSchedule) {
      await t.rollback();
      return res.status(404).json({ error: 'New schedule not found' });
    }

    // Calculate fees
    const originalFare = parseFloat(booking.totalFare);
    const newFare = parseFloat(newSchedule.price) * booking.noOfPassengers;
    const reschedulingFee = originalFare * 0.10; // 10% rescheduling fee
    const fareDifference = newFare - originalFare;
    const totalDeduction = reschedulingFee + (fareDifference > 0 ? fareDifference : 0);
    const newTotalFare = originalFare + totalDeduction;

    // Delete old booked seats
    await models.HelicopterBookedSeat.destroy({
      where: { helicopter_booking_id: booking.id },
      transaction: t
    });

    // Create new booked seats
    for (const seatLabel of newSeatLabels) {
      await models.HelicopterBookedSeat.create({
        helicopter_booking_id: booking.id,
        helicopter_schedule_id: newScheduleId,
        bookDate: newBookDate,
        seat_label: seatLabel,
        booked_seat: 1
      }, { transaction: t });
    }

    // Update booking
    await booking.update({
      helicopter_schedule_id: newScheduleId,
      bookDate: newBookDate,
      totalFare: newTotalFare,
      bookingStatus: 'CONFIRMED'
    }, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: 'Helicopter booking rescheduled successfully',
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        newScheduleId,
        newBookDate,
        newSeats: newSeatLabels
      },
      charges: {
        originalFare,
        newFare,
        reschedulingFee,
        fareDifference,
        totalDeduction,
        newTotalFare
      },
      note: 'Rescheduled booking is non-refundable'
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error rescheduling helicopter booking:', error);
    return res.status(500).json({ 
      error: 'Failed to reschedule booking',
      message: error.message 
    });
  }
};

/**
 * Get user's rescheduling history
 */
const getUserReschedulingHistory = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers.token || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Get all bookings that have been rescheduled
    // Note: You might want to add a 'rescheduled_at' field to track this
    const flightBookings = await models.Booking.findAll({
      where: { 
        bookedUserId: userId,
        bookingStatus: 'CONFIRMED'
      },
      include: [
        { model: models.FlightSchedule },
        { model: models.BookedSeat }
      ],
      order: [['updated_at', 'DESC']]
    });

    const helicopterBookings = await models.HelicopterBooking.findAll({
      where: { 
        bookedUserId: userId,
        bookingStatus: 'CONFIRMED'
      },
      include: [
        { model: models.HelicopterSchedule },
        { model: models.HelicopterBookedSeat, as: 'BookedSeats' }
      ],
      order: [['updated_at', 'DESC']]
    });

    return res.json({
      success: true,
      flightBookings: flightBookings.map(b => ({
        id: b.id,
        pnr: b.pnr,
        bookingNo: b.bookingNo,
        bookDate: b.bookDate,
        totalFare: b.totalFare,
        updatedAt: b.updated_at,
        type: 'flight'
      })),
      helicopterBookings: helicopterBookings.map(b => ({
        id: b.id,
        pnr: b.pnr,
        bookingNo: b.bookingNo,
        bookDate: b.bookDate,
        totalFare: b.totalFare,
        updatedAt: b.updated_at,
        type: 'helicopter'
      }))
    });

  } catch (error) {
    console.error('Error fetching rescheduling history:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch rescheduling history',
      message: error.message 
    });
  }
};

/**
 * Create Razorpay order for rescheduling payment
 */
const createReschedulingOrder = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { bookingType, newScheduleId } = req.body;

    const token = req.headers.authorization?.split(' ')[1] || req.headers.token || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Get booking
    console.log('Creating rescheduling order for booking:', bookingId, 'type:', bookingType, 'newScheduleId:', newScheduleId);
    
    let booking, newSchedule;
    if (bookingType === 'helicopter') {
      booking = await models.HelicopterBooking.findByPk(bookingId);
      newSchedule = await models.HelicopterSchedule.findByPk(newScheduleId);
    } else {
      booking = await models.Booking.findByPk(bookingId);
      newSchedule = await models.FlightSchedule.findByPk(newScheduleId);
    }

    console.log('Booking found:', booking ? 'yes' : 'no', 'Schedule found:', newSchedule ? 'yes' : 'no');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.bookedUserId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!newSchedule) {
      return res.status(404).json({ error: 'New schedule not found' });
    }

    // Calculate payment amount
    console.log('Booking details:', { totalFare: booking.totalFare, noOfPassengers: booking.noOfPassengers });
    console.log('New schedule price:', newSchedule.price);
    
    const originalFare = parseFloat(booking.totalFare) || 0;
    const newFare = parseFloat(newSchedule.price) * (booking.noOfPassengers || 1);
    const reschedulingFee = originalFare * 0.10; // 10% rescheduling fee
    const fareDifference = newFare - originalFare;
    const totalPaymentRequired = reschedulingFee + (fareDifference > 0 ? fareDifference : 0);

    // If no payment required (downgrade or same price) or amount too small for Razorpay (min ₹1)
    if (totalPaymentRequired < 1) {
      return res.json({
        success: true,
        paymentRequired: false,
        message: 'No additional payment required',
        charges: {
          originalFare,
          newFare,
          reschedulingFee,
          fareDifference,
          totalPaymentRequired: totalPaymentRequired > 0 ? totalPaymentRequired : 0
        }
      });
    }

    // Create Razorpay order
    console.log('Creating Razorpay order for amount:', totalPaymentRequired);
    const order = await razorpay.orders.create({
      amount: Math.round(totalPaymentRequired * 100), // Convert to paise
      currency: 'INR',
      receipt: `reschedule_${bookingId}_${Date.now()}`,
      notes: {
        bookingId: bookingId.toString(),
        bookingType,
        newScheduleId: newScheduleId.toString(),
        type: 'rescheduling'
      }
    });
    console.log('Razorpay order created:', order.id);

    return res.json({
      success: true,
      paymentRequired: true,
      orderId: order.id,
      amount: totalPaymentRequired,
      currency: 'INR',
      charges: {
        originalFare,
        newFare,
        reschedulingFee,
        fareDifference,
        totalPaymentRequired
      }
    });

  } catch (error) {
    console.error('Error creating rescheduling order:', error);
    console.error('Error stack:', error.stack);
    
    // Check for Razorpay specific errors
    if (error.error) {
      console.error('Razorpay error details:', error.error);
      return res.status(500).json({
        error: 'Failed to create payment order',
        message: error.error.description || error.message,
        razorpayError: error.error
      });
    }
    
    return res.status(500).json({
      error: 'Failed to create payment order',
      message: error.message
    });
  }
};

/**
 * Verify payment and complete rescheduling
 */
const verifyReschedulingPayment = async (req, res) => {
  const { bookingId } = req.params;
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature,
    bookingType,
    newScheduleId,
    newBookDate,
    newSeatLabels
  } = req.body;

  let t;
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.headers.token || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Verify Razorpay signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Start transaction
    t = await models.sequelize.transaction();

    let booking, newSchedule, bookedSeatModel, scheduleIdField, bookingIdField;
    
    if (bookingType === 'helicopter') {
      booking = await models.HelicopterBooking.findByPk(bookingId, {
        include: [{ model: models.HelicopterSchedule }],
        transaction: t
      });
      newSchedule = await models.HelicopterSchedule.findByPk(newScheduleId, { transaction: t });
      bookedSeatModel = models.HelicopterBookedSeat;
      scheduleIdField = 'helicopter_schedule_id';
      bookingIdField = 'helicopter_booking_id';
    } else {
      booking = await models.Booking.findByPk(bookingId, {
        include: [{ model: models.FlightSchedule }],
        transaction: t
      });
      newSchedule = await models.FlightSchedule.findByPk(newScheduleId, { transaction: t });
      bookedSeatModel = models.BookedSeat;
      scheduleIdField = 'schedule_id';
      bookingIdField = 'booking_id';
    }

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.bookedUserId !== userId) {
      await t.rollback();
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Calculate fees
    const originalFare = parseFloat(booking.totalFare);
    const newFare = parseFloat(newSchedule.price) * booking.noOfPassengers;
    const reschedulingFee = originalFare * 0.10;
    const fareDifference = newFare - originalFare;
    const totalDeduction = reschedulingFee + (fareDifference > 0 ? fareDifference : 0);
    const newTotalFare = originalFare + totalDeduction;

    // Delete old booked seats
    await bookedSeatModel.destroy({
      where: { [bookingIdField]: booking.id },
      transaction: t
    });

    // Create new booked seats
    for (const seatLabel of newSeatLabels) {
      await bookedSeatModel.create({
        [bookingIdField]: booking.id,
        [scheduleIdField]: newScheduleId,
        bookDate: newBookDate,
        seat_label: seatLabel,
        booked_seat: 1
      }, { transaction: t });
    }

    // Update booking
    await booking.update({
      [scheduleIdField]: newScheduleId,
      bookDate: newBookDate,
      totalFare: newTotalFare,
      bookingStatus: 'CONFIRMED'
    }, { transaction: t });

    // Create payment record
    await models.Payment.create({
      booking_id: bookingType === 'helicopter' ? null : booking.id,
      helicopter_booking_id: bookingType === 'helicopter' ? booking.id : null,
      user_id: userId,
      transaction_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      payment_status: 'SUCCESS',
      payment_mode: 'RAZORPAY',
      payment_amount: totalDeduction,
      message: 'Rescheduling payment'
    }, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: 'Booking rescheduled successfully',
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        newScheduleId,
        newBookDate,
        newSeats: newSeatLabels
      },
      payment: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: totalDeduction
      },
      charges: {
        originalFare,
        newFare,
        reschedulingFee,
        fareDifference,
        totalDeduction,
        newTotalFare
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error verifying rescheduling payment:', error);
    return res.status(500).json({
      error: 'Failed to complete rescheduling',
      message: error.message
    });
  }
};

/**
 * Admin reschedule booking - No payment required
 * Admin can reschedule any booking without payment gateway
 */
const adminRescheduleBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { bookingType, newScheduleId, newBookDate, newSeatLabels, waiveFee } = req.body;

  let t;
  try {
    // Start transaction
    t = await models.sequelize.transaction();

    let booking, newSchedule, bookedSeatModel, scheduleIdField, bookingIdField;

    if (bookingType === 'helicopter') {
      booking = await models.HelicopterBooking.findByPk(bookingId, {
        include: [{ model: models.HelicopterSchedule }],
        transaction: t
      });
      newSchedule = await models.HelicopterSchedule.findByPk(newScheduleId, { transaction: t });
      bookedSeatModel = models.HelicopterBookedSeat;
      scheduleIdField = 'helicopter_schedule_id';
      bookingIdField = 'helicopter_booking_id';
    } else {
      booking = await models.Booking.findByPk(bookingId, {
        include: [{ model: models.FlightSchedule }],
        transaction: t
      });
      newSchedule = await models.FlightSchedule.findByPk(newScheduleId, { transaction: t });
      bookedSeatModel = models.BookedSeat;
      scheduleIdField = 'schedule_id';
      bookingIdField = 'booking_id';
    }

    if (!booking) {
      await t.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (!newSchedule) {
      await t.rollback();
      return res.status(404).json({ error: 'New schedule not found' });
    }

    // Calculate fees (for record keeping, but not charged)
    const originalFare = parseFloat(booking.totalFare);
    const newFare = parseFloat(newSchedule.price) * booking.noOfPassengers;
    const reschedulingFee = waiveFee ? 0 : originalFare * 0.10;
    const fareDifference = newFare - originalFare;
    
    // Admin can choose to waive fees or charge the difference
    const totalDeduction = waiveFee ? 0 : (reschedulingFee + (fareDifference > 0 ? fareDifference : 0));
    const newTotalFare = waiveFee ? newFare : (originalFare + totalDeduction);

    // Delete old booked seats
    await bookedSeatModel.destroy({
      where: { [bookingIdField]: booking.id },
      transaction: t
    });

    // Create new booked seats
    for (const seatLabel of newSeatLabels) {
      await bookedSeatModel.create({
        [bookingIdField]: booking.id,
        [scheduleIdField]: newScheduleId,
        bookDate: newBookDate,
        seat_label: seatLabel,
        booked_seat: 1
      }, { transaction: t });
    }

    // Update booking
    await booking.update({
      [scheduleIdField]: newScheduleId,
      bookDate: newBookDate,
      totalFare: newTotalFare,
      bookingStatus: 'CONFIRMED'
    }, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      message: 'Booking rescheduled successfully by admin',
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        newScheduleId,
        newBookDate,
        newSeats: newSeatLabels
      },
      charges: {
        originalFare,
        newFare,
        reschedulingFee,
        fareDifference,
        totalDeduction,
        newTotalFare,
        waived: waiveFee || false
      }
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error in admin reschedule:', error);
    return res.status(500).json({
      error: 'Failed to reschedule booking',
      message: error.message
    });
  }
};

module.exports = {
  getReschedulingDetails,
  rescheduleFlightBooking,
  rescheduleHelicopterBooking,
  getUserReschedulingHistory,
  createReschedulingOrder,
  verifyReschedulingPayment,
  adminRescheduleBooking
};
