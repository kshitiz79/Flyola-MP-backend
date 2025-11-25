const models = require('../model');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const { sendCancellationEmail } = require('../utils/emailService');

// Calculate refund amount based on cancellation policy (same as flight)
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

// Get helicopter cancellation details (preview before actual cancellation)
const getCancellationDetails = async (req, res) => {
    const { bookingId } = req.params;

    try {
        const booking = await models.HelicopterBooking.findByPk(bookingId, {
            include: [
                { model: models.HelicopterSchedule }
            ]
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Helicopter booking not found'
            });
        }

        if (booking.bookingStatus === 'CANCELLED') {
            return res.status(400).json({
                success: false,
                error: 'Booking is already cancelled'
            });
        }

        // Calculate hours before departure
        const departureDateTime = dayjs(`${booking.bookDate} ${booking.HelicopterSchedule?.departure_time || '00:00'}`);
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
        console.error('Error getting helicopter cancellation details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cancellation details: ' + error.message
        });
    }
};

// Admin: Cancel helicopter booking with full refund or policy-based refund
const adminCancelBooking = async (req, res) => {
    let transaction;
    const { bookingId } = req.params;
    const { reason, cancellationType, adminNotes } = req.body; // cancellationType: 'full' or 'policy'

    try {
        transaction = await models.sequelize.transaction();

        // Get helicopter booking details
        const booking = await models.HelicopterBooking.findByPk(bookingId, {
            include: [
                {
                    model: models.HelicopterSchedule,
                    include: [
                        { model: models.Helicopter, as: 'Helicopter' },
                        { model: models.Helipad, as: 'DepartureLocation' },
                        { model: models.Helipad, as: 'ArrivalLocation' }
                    ]
                },
                { model: models.User },
                { model: models.HelicopterPassenger, as: 'Passengers' }
            ],
            transaction
        });

        if (!booking) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                error: 'Helicopter booking not found'
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
        const departureDateTime = dayjs(`${booking.bookDate} ${booking.HelicopterSchedule.departure_time}`);
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
        const refund = await models.HelicopterRefund.create({
            helicopter_booking_id: booking.id,
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
            await models.HelicopterBookedSeat.destroy({
                where: {
                    helicopter_schedule_id: booking.helicopter_schedule_id,
                    bookDate: booking.bookDate,
                    helicopter_booking_id: booking.id
                },
                transaction
            });
        }

        await transaction.commit();

        // Send cancellation email to user
        try {
            const helicopter = await models.Helicopter.findByPk(booking.HelicopterSchedule?.helicopter_id);
            
            const emailData = {
                email: booking.email_id,
                pnr: booking.pnr,
                bookingNo: booking.bookingNo,
                passengerName: booking.Passengers?.[0]?.name || 'Passenger',
                departureCity: booking.HelicopterSchedule?.DepartureLocation?.city || 'Unknown',
                arrivalCity: booking.HelicopterSchedule?.ArrivalLocation?.city || 'Unknown',
                departureDate: booking.bookDate,
                departureTime: booking.HelicopterSchedule?.departure_time || 'N/A',
                flightNumber: helicopter?.helicopter_number || 'N/A',
                totalFare: totalFare,
                refundAmount: refundAmount,
                cancellationCharges: cancellationCharges,
                cancelledBy: 'Admin',
                cancellationReason: reason || `Admin cancellation - ${cancellationType === 'full' ? 'Full refund granted' : 'Policy-based refund'}`,
                bookingType: 'helicopter'
            };

            await sendCancellationEmail(emailData);
            console.log('✅ Admin helicopter cancellation email sent to:', booking.email_id);
        } catch (emailError) {
            console.error('❌ Failed to send admin helicopter cancellation email:', emailError);
            // Don't fail the cancellation if email fails
        }

        res.json({
            success: true,
            message: `Helicopter booking cancelled successfully with ${cancellationType === 'full' ? 'full refund' : 'policy-based refund'}`,
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
        console.error('Helicopter cancellation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel helicopter booking: ' + error.message
        });
    }
};

// Cancel helicopter booking (user-initiated)
const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    const { reason } = req.body;

    let transaction;
    try {
        transaction = await models.sequelize.transaction();

        // Find booking with related data
        const booking = await models.HelicopterBooking.findByPk(bookingId, {
            include: [
                { model: models.HelicopterSchedule },
                { model: models.Payment, as: 'Payments' },
                { model: models.Passenger, as: 'Passengers' },
                { model: models.HelicopterBookedSeat, as: 'BookedSeats' }
            ],
            transaction
        });

        if (!booking) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                error: 'Helicopter booking not found'
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
        const departureDateTime = dayjs(`${booking.bookDate} ${booking.HelicopterSchedule?.departure_time || '00:00'}`);
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
        const refund = await models.HelicopterRefund.create({
            helicopter_booking_id: booking.id,
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
        await models.HelicopterBookedSeat.destroy({
            where: { helicopter_booking_id: booking.id },
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

        // Send cancellation email to user
        try {
            const departureHelipad = await models.Helipad.findByPk(booking.HelicopterSchedule?.departure_helipad_id);
            const arrivalHelipad = await models.Helipad.findByPk(booking.HelicopterSchedule?.arrival_helipad_id);
            const helicopter = await models.Helicopter.findByPk(booking.HelicopterSchedule?.helicopter_id);
            
            const emailData = {
                email: booking.email_id,
                pnr: booking.pnr,
                bookingNo: booking.bookingNo,
                passengerName: booking.Passengers?.[0]?.name || 'Passenger',
                departureCity: departureHelipad?.city || 'Unknown',
                arrivalCity: arrivalHelipad?.city || 'Unknown',
                departureDate: booking.bookDate,
                departureTime: booking.HelicopterSchedule?.departure_time || 'N/A',
                flightNumber: helicopter?.helicopter_number || 'N/A',
                totalFare: totalFare,
                refundAmount: refundAmount,
                cancellationCharges: cancellationCharges,
                cancelledBy: 'User',
                cancellationReason: reason || 'User requested cancellation',
                bookingType: 'helicopter'
            };

            await sendCancellationEmail(emailData);
            console.log('✅ Helicopter cancellation email sent to:', booking.email_id);
        } catch (emailError) {
            console.error('❌ Failed to send helicopter cancellation email:', emailError);
            // Don't fail the cancellation if email fails
        }

        res.json({
            success: true,
            message: 'Helicopter booking cancelled successfully',
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
            error: 'Failed to cancel helicopter booking: ' + error.message
        });
    }
};

module.exports = {
    getCancellationDetails,
    adminCancelBooking,
    cancelBooking
};
