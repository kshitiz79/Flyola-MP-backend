/**
 * Cleanup Job: Remove expired pending bookings
 * Runs every 5 minutes to release seats from expired bookings
 */

const cron = require('node-cron');
const models = require('../model');
const { Op } = require('sequelize');

// A booking is considered expired if it has been PENDING for more than 20 minutes.
// This covers both cases:
//   1. booking_expires_at is set and has passed (new bookings)
//   2. booking_expires_at is NULL but created_at is old (helicopter bookings — field missing from model)
const EXPIRY_MINUTES = 20;

/**
 * Cleanup expired flight bookings
 */
async function cleanupExpiredFlightBookings() {
  try {
    const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

    // Match bookings that are PENDING and either:
    //   - have an explicit expiry time that has passed, OR
    //   - have no expiry time but were created more than EXPIRY_MINUTES ago
    const expiredBookings = await models.Booking.findAll({
      where: {
        bookingStatus: 'PENDING',
        [Op.or]: [
          {
            booking_expires_at: {
              [Op.lt]: new Date(),
              [Op.not]: null,
            },
          },
          {
            booking_expires_at: null,
            created_at: { [Op.lt]: cutoff },
          },
        ],
      },
      include: [{ model: models.BookedSeat, as: 'BookedSeats' }],
    });

    if (expiredBookings.length === 0) return 0;

    let cleanedCount = 0;

    for (const booking of expiredBookings) {
      try {
        await models.sequelize.transaction(async (t) => {
          await booking.update(
            {
              bookingStatus: 'EXPIRED',
              paymentStatus: 'EXPIRED',
              cancellationReason: 'Booking expired - payment not completed within 15 minutes',
              cancelledAt: new Date(),
            },
            { transaction: t }
          );

          // Delete ALL seats for this booking regardless of status.
          // Seats default to status='CONFIRMED', not 'HOLD', so filtering
          // by status would silently delete nothing.
          const deletedSeats = await models.BookedSeat.destroy({
            where: { booking_id: booking.id },
            transaction: t,
          });

          console.log(`[Cleanup] Expired flight booking ${booking.pnr} - Released ${deletedSeats} seats`);
          cleanedCount++;
        });
      } catch (error) {
        console.error(`[Cleanup] Failed to cleanup flight booking ${booking.id}:`, error.message);
      }
    }

    return cleanedCount;
  } catch (error) {
    console.error('[Cleanup] Error in cleanupExpiredFlightBookings:', error);
    return 0;
  }
}

/**
 * Cleanup expired helicopter bookings.
 *
 * NOTE: HelicopterBooking model does NOT have a booking_expires_at column,
 * so we fall back entirely to created_at age to detect stale PENDING bookings.
 */
async function cleanupExpiredHelicopterBookings() {
  try {
    const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

    const expiredBookings = await models.HelicopterBooking.findAll({
      where: {
        bookingStatus: 'PENDING',
        created_at: { [Op.lt]: cutoff },
      },
      include: [{ model: models.HelicopterBookedSeat, as: 'BookedSeats' }],
    });

    if (expiredBookings.length === 0) return 0;

    let cleanedCount = 0;

    for (const booking of expiredBookings) {
      try {
        await models.sequelize.transaction(async (t) => {
          await booking.update(
            {
              bookingStatus: 'EXPIRED',
              paymentStatus: 'EXPIRED',
              cancellationReason: 'Booking expired - payment not completed within 15 minutes',
              cancelledAt: new Date(),
            },
            { transaction: t }
          );

          // Delete ALL seats for this booking regardless of status.
          // Seats default to status='CONFIRMED', not 'HOLD', so filtering
          // by status would silently delete nothing.
          const deletedSeats = await models.HelicopterBookedSeat.destroy({
            where: { helicopter_booking_id: booking.id },
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
 * One-time cleanup for orphaned booked_seats rows that belong to bookings
 * which are already EXPIRED or CANCELLED but whose seat rows were never deleted
 * (caused by the old status:'HOLD' bug).
 */
async function cleanupOrphanedSeats() {
  try {
    // Flight orphaned seats
    const orphanedFlightSeats = await models.BookedSeat.destroy({
      where: {
        booking_id: {
          [Op.in]: models.sequelize.literal(
            `(SELECT id FROM bookings WHERE bookingStatus IN ('EXPIRED', 'CANCELLED'))`
          ),
        },
      },
    });

    // Helicopter orphaned seats
    const orphanedHelicopterSeats = await models.HelicopterBookedSeat.destroy({
      where: {
        helicopter_booking_id: {
          [Op.in]: models.sequelize.literal(
            `(SELECT id FROM helicopter_bookings WHERE bookingStatus IN ('EXPIRED', 'CANCELLED'))`
          ),
        },
      },
    });

    if (orphanedFlightSeats > 0 || orphanedHelicopterSeats > 0) {
      console.log(
        `[Cleanup] One-time orphan cleanup: removed ${orphanedFlightSeats} flight seats + ${orphanedHelicopterSeats} helicopter seats`
      );
    }
  } catch (error) {
    console.error('[Cleanup] Error in cleanupOrphanedSeats:', error.message);
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
 * Start the cleanup cron job — runs every 5 minutes
 */
function startCleanupJob() {
  cron.schedule('*/5 * * * *', async () => {
    await cleanupExpiredBookings();
  });

  console.log('[Cleanup] Cron job started - runs every 5 minutes');

  // On startup: first run the one-time orphan cleanup for existing bad data,
  // then run the regular expiry cleanup
  setTimeout(async () => {
    await cleanupOrphanedSeats();
    await cleanupExpiredBookings();
  }, 5000);
}

module.exports = {
  startCleanupJob,
  cleanupExpiredBookings,
  cleanupOrphanedSeats,
};
