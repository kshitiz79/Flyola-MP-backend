/**
 * Cleanup Job: Remove expired pending bookings
 * Runs every 5 minutes to release seats from expired bookings
 */

const cron = require('node-cron');
const models = require('../model');
const { Op } = require('sequelize');

/**
 * Cleanup expired flight bookings
 */
async function cleanupExpiredFlightBookings() {
  try {
    const expiredBookings = await models.Booking.findAll({
      where: {
        bookingStatus: 'PENDING',
        booking_expires_at: {
          [Op.lt]: new Date(),
          [Op.not]: null,
        },
      },
      include: [
        {
          model: models.BookedSeat,
          as: 'BookedSeats',
        },
      ],
    });

    if (expiredBookings.length === 0) {
      return 0;
    }

    let cleanedCount = 0;

    for (const booking of expiredBookings) {
      try {
        await models.sequelize.transaction(async (t) => {
          // Update booking status to EXPIRED
          await booking.update(
            {
              bookingStatus: 'EXPIRED',
              paymentStatus: 'EXPIRED',
              cancellationReason: 'Booking expired - payment not completed within 15 minutes',
              cancelledAt: new Date(),
            },
            { transaction: t }
          );

          // Release seats (delete HOLD seats)
          const deletedSeats = await models.BookedSeat.destroy({
            where: {
              booking_id: booking.id,
              status: 'HOLD',
            },
            transaction: t,
          });

          console.log(`[Cleanup] Expired flight booking ${booking.pnr} - Released ${deletedSeats} seats`);
          cleanedCount++;
        });
      } catch (error) {
        console.error(`[Cleanup] Failed to cleanup booking ${booking.id}:`, error.message);
      }
    }

    return cleanedCount;
  } catch (error) {
    console.error('[Cleanup] Error in cleanupExpiredFlightBookings:', error);
    return 0;
  }
}

/**
 * Cleanup expired helicopter bookings
 */
async function cleanupExpiredHelicopterBookings() {
  try {
    const expiredBookings = await models.HelicopterBooking.findAll({
      where: {
        bookingStatus: 'PENDING',
        booking_expires_at: {
          [Op.lt]: new Date(),
          [Op.not]: null,
        },
      },
      include: [
        {
          model: models.HelicopterBookedSeat,
          as: 'BookedSeats',
        },
      ],
    });

    if (expiredBookings.length === 0) {
      return 0;
    }

    let cleanedCount = 0;

    for (const booking of expiredBookings) {
      try {
        await models.sequelize.transaction(async (t) => {
          // Update booking status to EXPIRED
          await booking.update(
            {
              bookingStatus: 'EXPIRED',
              paymentStatus: 'EXPIRED',
              cancellationReason: 'Booking expired - payment not completed within 15 minutes',
              cancelledAt: new Date(),
            },
            { transaction: t }
          );

          // Release seats (delete HOLD seats)
          const deletedSeats = await models.HelicopterBookedSeat.destroy({
            where: {
              helicopter_booking_id: booking.id,
              status: 'HOLD',
            },
            transaction: t,
          });

          console.log(`[Cleanup] Expired helicopter booking ${booking.pnr} - Released ${deletedSeats} seats`);
          cleanedCount++;
        });
      } catch (error) {
        console.error(`[Cleanup] Failed to cleanup helicopter booking ${booking.id}:`, error.message);
      }
    }

    return cleanedCount;
  } catch (error) {
    console.error('[Cleanup] Error in cleanupExpiredHelicopterBookings:', error);
    return 0;
  }
}

/**
 * Main cleanup function
 */
async function cleanupExpiredBookings() {
  console.log('[Cleanup] Starting expired bookings cleanup...');
  const startTime = Date.now();

  const flightCount = await cleanupExpiredFlightBookings();
  const helicopterCount = await cleanupExpiredHelicopterBookings();

  const totalCount = flightCount + helicopterCount;
  const duration = Date.now() - startTime;

  console.log(
    `[Cleanup] Completed in ${duration}ms - Cleaned ${totalCount} bookings (${flightCount} flights, ${helicopterCount} helicopters)`
  );
}

/**
 * Start the cleanup cron job
 * Runs every 5 minutes
 */
function startCleanupJob() {
  // Run every 5 minutes: */5 * * * *
  cron.schedule('*/5 * * * *', async () => {
    await cleanupExpiredBookings();
  });

  console.log('[Cleanup] Cron job started - runs every 5 minutes');

  // Run immediately on startup
  setTimeout(() => {
    cleanupExpiredBookings();
  }, 5000); // Wait 5 seconds after server start
}

module.exports = {
  startCleanupJob,
  cleanupExpiredBookings,
};
