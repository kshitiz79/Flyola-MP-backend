const models = require('../model');
const { Op } = require('sequelize');
const dayjs = require('dayjs');

// Calculate refund amount based on cancellation policy
const calculateRefundAmount = (totalFare, hoursBeforeDeparture) => {
  const amount = parseFloat(totalFare);
  
  if (hoursBeforeDeparture > 96) {
    // More than 96 hours: INR 400 flat fee
    return Math.max(0, amount - 400);
  } else if (hoursBeforeDeparture >= 48) {
    // 48-96 hours: 25% deduction
    return amount * 0.75;
  } else if (hoursBeforeDeparture >= 24) {
    // 24-48 hours: 50% deduction
    return amount * 0.50;
  } else {
    // Less than 24 hours: No refund
    return 0;
  }
};

// Calculate cancellation charges
const calculateCancellationCharges = (totalFare, hoursBeforeDeparture) => {
  const amount = parseFloat(totalFare);
  
  if (hoursBeforeDeparture > 96) {
    return 400; // Flat fee
  } else if (hoursBeforeDeparture >= 48) {
    return amount * 0.25; // 25%
  } else if (hoursBeforeDeparture >= 24) {
    return amount * 0.50; // 50%
  } else {
    return amount; // 100% - no refund
  }
};

// Cancel booking and process refund
const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { reason } = req.body;

  let transaction;
  try {
    transaction = await models.sequelize.transaction();

    // Find booking with related data
    const booking = await models.Booking.findByPk(bookingId, {
      include: [
        { model: models.FlightSchedule },
        { model: models.Payment, as: 'Payments' },
        { model: models.Passenger },
        { model: models.BookedSeat }
      ],
      transaction
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }

    // Check if booking is already cancelled
    if (booking.bookingStatus === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: 'Booking is already cancelled' 
      });
    }

    // Check if booking can be cancelled (only confirmed bookings)
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'SUCCESS') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        error: 'Only confirmed bookings can be cancelled' 
      });
    }

    // Calculate hours before departure
    const departureDateTime = dayjs(`${booking.bookDate} ${booking.FlightSchedule?.departure_time || '00:00'}`);
    const now = dayjs();
    const hoursBeforeDeparture = departureDateTime.diff(now, 'hour');

    // Calculate refund amount and charges
    const totalFare = parseFloat(booking.totalFare);
    const refundAmount = calculateRefundAmount(totalFare, hoursBeforeDeparture);
    const cancellationCharges = calculateCancellationCharges(totalFare, hoursBeforeDeparture);

    // Update booking status
    await booking.update({
      bookingStatus: 'CANCELLED',
      cancellationReason: reason || 'User requested cancellation',
      cancelledAt: new Date(),
      refundAmount: refundAmount,
      cancellationCharges: cancellationCharges
    }, { transaction });

    // Create refund record
    const refund = await models.Refund.create({
      booking_id: booking.id,
      user_id: booking.bookedUserId,
      original_amount: totalFare,
      refund_amount: refundAmount,
      cancellation_charges: cancellationCharges,
      refund_status: refundAmount > 0 ? 'PENDING' : 'NOT_APPLICABLE',
      refund_reason: 'Booking cancellation',
      hours_before_departure: hoursBeforeDeparture,
      requested_at: new Date()
    }, { transaction });

    // Release booked seats
    await models.BookedSeat.destroy({
      where: { booking_id: booking.id },
      transaction
    });

    // If there's a refund amount, update payment status
    if (refundAmount > 0 && booking.Payments && booking.Payments.length > 0) {
      await models.Payment.update(
        { 
          payment_status: 'REFUND_PENDING',
          refund_amount: refundAmount,
          updated_at: new Date()
        },
        { 
          where: { booking_id: booking.id },
          transaction 
        }
      );
    }

    await transaction.commit();

    // Emit seat update event
    if (req.io) {
      req.io.emit('seats-updated', {
        schedule_id: booking.schedule_id,
        bookDate: booking.bookDate,
        message: 'Seats released due to cancellation'
      });
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        bookingId: booking.id,
        pnr: booking.pnr,
        cancellationCharges,
        refundAmount,
        refundStatus: refundAmount > 0 ? 'PENDING' : 'NOT_APPLICABLE',
        hoursBeforeDeparture,
        refundId: refund.id
      }
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking: ' + error.message
    });
  }
};

// Get cancellation details (preview before actual cancellation)
const getCancellationDetails = async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await models.Booking.findByPk(bookingId, {
      include: [
        { model: models.FlightSchedule },
        { model: models.Payment, as: 'Payments' }
      ]
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }

    if (booking.bookingStatus === 'CANCELLED') {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking is already cancelled' 
      });
    }

    // Calculate hours before departure
    const departureDateTime = dayjs(`${booking.bookDate} ${booking.FlightSchedule?.departure_time || '00:00'}`);
    const now = dayjs();
    const hoursBeforeDeparture = departureDateTime.diff(now, 'hour');

    // Calculate refund details
    const totalFare = parseFloat(booking.totalFare);
    const refundAmount = calculateRefundAmount(totalFare, hoursBeforeDeparture);
    const cancellationCharges = calculateCancellationCharges(totalFare, hoursBeforeDeparture);

    // Determine cancellation policy tier
    let policyTier = '';
    if (hoursBeforeDeparture > 96) {
      policyTier = 'More than 96 hours - INR 400 flat cancellation fee';
    } else if (hoursBeforeDeparture >= 48) {
      policyTier = '48-96 hours - 25% cancellation charges';
    } else if (hoursBeforeDeparture >= 24) {
      policyTier = '24-48 hours - 50% cancellation charges';
    } else {
      policyTier = 'Less than 24 hours - No refund applicable';
    }

    res.json({
      success: true,
      data: {
        bookingId: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        totalFare,
        refundAmount,
        cancellationCharges,
        hoursBeforeDeparture,
        policyTier,
        canCancel: hoursBeforeDeparture > 0, // Can cancel if departure hasn't passed
        departureDateTime: departureDateTime.format('YYYY-MM-DD HH:mm:ss')
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get cancellation details: ' + error.message
    });
  }
};

// Get user's refunds
const getUserRefunds = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }

    const refunds = await models.Refund.findAll({
      where: { user_id: userId },
      include: [
        {
          model: models.Booking,
          attributes: ['id', 'pnr', 'bookingNo', 'bookDate', 'totalFare']
        }
      ],
      order: [['requested_at', 'DESC']]
    });

    res.json({
      success: true,
      data: refunds
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get refunds: ' + error.message
    });
  }
};

// Admin: Process refund
const processRefund = async (req, res) => {
  const { refundId } = req.params;
  const { status, adminNotes } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status. Must be APPROVED or REJECTED'
    });
  }

  let transaction;
  try {
    transaction = await models.sequelize.transaction();

    const refund = await models.Refund.findByPk(refundId, {
      include: [{ model: models.Booking }],
      transaction
    });

    if (!refund) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Refund not found'
      });
    }

    if (refund.refund_status !== 'PENDING') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Refund is not in pending status'
      });
    }

    // Update refund status
    await refund.update({
      refund_status: status,
      admin_notes: adminNotes,
      processed_at: new Date(),
      processed_by: req.user?.id
    }, { transaction });

    // Update payment status
    if (status === 'APPROVED') {
      await models.Payment.update(
        { payment_status: 'REFUNDED' },
        { 
          where: { booking_id: refund.booking_id },
          transaction 
        }
      );
    }

    await transaction.commit();

    res.json({
      success: true,
      message: `Refund ${status.toLowerCase()} successfully`,
      data: refund
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({
      success: false,
      error: 'Failed to process refund: ' + error.message
    });
  }
};

// Admin: Cancel booking with full refund or policy-based refund
const adminCancelBooking = async (req, res) => {
  let transaction;
  const { bookingId } = req.params;
  const { reason, cancellationType, adminNotes } = req.body; // cancellationType: 'full' or 'policy'

  try {
    transaction = await models.sequelize.transaction();

    // Get booking details
    const booking = await models.Booking.findByPk(bookingId, {
      include: [
        {
          model: models.FlightSchedule,
          include: [
            { model: models.Flight },
            { model: models.Airport, as: 'DepartureAirport' },
            { model: models.Airport, as: 'ArrivalAirport' }
          ]
        },
        { model: models.User },
        { model: models.Passenger }
      ],
      transaction
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if booking can be cancelled (only confirmed bookings)
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'SUCCESS') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Only confirmed bookings can be cancelled'
      });
    }

    // Check if booking is already cancelled
    if (booking.bookingStatus === 'CANCELLED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Booking is already cancelled'
      });
    }

    // Calculate hours before departure
    const departureDateTime = dayjs(`${booking.bookDate} ${booking.FlightSchedule.departure_time}`);
    const now = dayjs();
    const hoursBeforeDeparture = departureDateTime.diff(now, 'hour', true);

    const totalFare = parseFloat(booking.totalFare);
    let refundAmount;
    let cancellationCharges;

    // Calculate refund based on cancellation type
    if (cancellationType === 'full') {
      // Admin full refund - no charges
      refundAmount = totalFare;
      cancellationCharges = 0;
    } else {
      // Policy-based refund
      refundAmount = calculateRefundAmount(totalFare, hoursBeforeDeparture);
      cancellationCharges = calculateCancellationCharges(totalFare, hoursBeforeDeparture);
    }

    // Update booking status
    await booking.update({
      bookingStatus: 'CANCELLED',
      cancellationReason: reason || `Admin cancellation - ${cancellationType === 'full' ? 'Full refund' : 'Policy-based'}`,
      cancelledAt: new Date(),
      refundAmount: refundAmount,
      cancellationCharges: cancellationCharges
    }, { transaction });

    // Create refund record
    const refund = await models.Refund.create({
      booking_id: booking.id,
      user_id: booking.bookedUserId,
      original_amount: totalFare,
      refund_amount: refundAmount,
      cancellation_charges: cancellationCharges,
      refund_status: refundAmount > 0 ? 'APPROVED' : 'NOT_APPLICABLE', // Admin cancellations are auto-approved
      refund_reason: `Admin cancellation - ${cancellationType === 'full' ? 'Full refund granted' : 'Policy-based refund'}`,
      hours_before_departure: hoursBeforeDeparture,
      requested_at: new Date(),
      processed_at: new Date(),
      processed_by: req.user.id, // Admin user ID
      admin_notes: adminNotes || `Admin ${cancellationType === 'full' ? 'full' : 'policy-based'} refund cancellation`
    }, { transaction });

    // Release seats if booking has seat assignments
    if (booking.BookedSeats && booking.BookedSeats.length > 0) {
      await models.BookedSeat.destroy({
        where: {
          schedule_id: booking.schedule_id,
          bookDate: booking.bookDate,
          booking_id: booking.id
        },
        transaction
      });

      // Log seat release
    }

    await transaction.commit();


    res.json({
      success: true,
      message: `Booking cancelled successfully with ${cancellationType === 'full' ? 'full refund' : 'policy-based refund'}`,
      data: {
        bookingId: booking.id,
        pnr: booking.pnr,
        cancellationCharges,
        refundAmount,
        refundStatus: refundAmount > 0 ? 'APPROVED' : 'NOT_APPLICABLE',
        cancellationType,
        processedBy: 'Admin'
      }
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking: ' + error.message
    });
  }
};

// Admin: Get all refunds
const getAllRefunds = async (req, res) => {
  try {
    const refunds = await models.Refund.findAll({
      include: [
        {
          model: models.Booking,
          attributes: ['id', 'pnr', 'bookingNo', 'totalFare', 'bookDate']
        },
        {
          model: models.User,
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['requested_at', 'DESC']]
    });

    res.json({
      success: true,
      data: refunds
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch refunds: ' + error.message
    });
  }
};

module.exports = {
  cancelBooking,
  getCancellationDetails,
  getUserRefunds,
  processRefund,
  adminCancelBooking,
  getAllRefunds
};