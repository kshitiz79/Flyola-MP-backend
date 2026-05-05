const SEG_CACHE = new WeakMap(); // kept for backward compatibility if imported elsewhere

/**
 * @deprecated Route-based segment logic is not used for helicopters.
 * Helicopters are point-to-point — use getAvailableHelicopterSeats directly.
 */
function getHelicopterRoute(helicopter) {
  if (SEG_CACHE.has(helicopter)) return SEG_CACHE.get(helicopter);
  let stops = [];
  try {
    stops = Array.isArray(helicopter.helipad_stop_ids)
      ? helicopter.helipad_stop_ids
      : JSON.parse(helicopter.helipad_stop_ids || '[]');
  } catch (e) {
    stops = [];
  }
  stops = stops.filter(id => id && Number.isInteger(id) && id !== 0);
  const route = [helicopter.start_helipad_id, ...stops, helicopter.end_helipad_id];
  SEG_CACHE.set(helicopter, route);
  return route;
}

/**
 * Generate seat labels based on seat limit
 * @param {number} seatLimit - Number of seats
 * @returns {Array} Array of seat labels (S1, S2, etc.)
 */
function generateHelicopterSeatLabels(seatLimit) {
  const seats = [];
  for (let i = 1; i <= seatLimit; i++) {
    seats.push(`S${i}`);
  }
  return seats;
}

/**
 * Get available helicopter seats for a specific schedule and date.
 *
 * NOTE: The old implementation tried to reuse the flight segment-overlap logic,
 * but it broke because:
 *   - Helicopter.start_helipad_id / end_helipad_id reference the `airports` table
 *   - HelicopterSchedule.departure_helipad_id / arrival_helipad_id reference `helipads`
 *   - These are different tables with different ID spaces, so route.indexOf() always
 *     returned -1, causing the function to return [] (no seats available) for every query.
 *
 * Helicopters are point-to-point (no shared fuselage across overlapping segments),
 * so a simple direct count against the exact schedule_id is correct and sufficient.
 *
 * @param {Object} params
 * @param {Object} params.models        - Sequelize models
 * @param {number} params.schedule_id   - HelicopterSchedule ID
 * @param {string} params.bookDate      - Booking date (YYYY-MM-DD)
 * @param {string} params.userId        - Optional: exclude this user's own holds
 * @param {Object} params.transaction   - Optional Sequelize transaction
 * @returns {Promise<string[]>} Array of available seat labels e.g. ['S1','S3']
 */
async function getAvailableHelicopterSeats({ models, schedule_id, bookDate, userId = null, transaction = null }) {
  // 1. Load schedule + helicopter (for seat_limit)
  const schedule = await models.HelicopterSchedule.findByPk(schedule_id, {
    include: [{ model: models.Helicopter, as: 'Helicopter' }],
    transaction,
  });

  if (!schedule) {
    console.log(`[Helicopter Seats] Schedule ${schedule_id} not found`);
    return [];
  }

  if (!schedule.Helicopter) {
    console.log(`[Helicopter Seats] Helicopter not found for schedule ${schedule_id}`);
    return [];
  }

  const seatLimit = schedule.Helicopter.seat_limit || 6;
  const allSeats = generateHelicopterSeatLabels(seatLimit);
  const now = new Date();

  // 2. Seats blocked by CONFIRMED bookings on this exact schedule + date
  //    Join to helicopter_bookings to exclude CANCELLED / EXPIRED bookings.
  const confirmedRows = await models.HelicopterBookedSeat.findAll({
    where: {
      helicopter_schedule_id: schedule_id,
      bookDate,
    },
    include: [{
      model: models.HelicopterBooking,
      attributes: [],
      // Only count seats whose booking is still active
      where: {
        bookingStatus: { [models.Sequelize.Op.in]: ['CONFIRMED', 'SUCCESS', 'PENDING'] },
      },
      required: true,
    }],
    attributes: ['seat_label'],
    transaction,
  });

  // 3. Among PENDING bookings above, exclude those that have already expired
  //    (booking_expires_at passed, or created > 20 min ago with no expiry field)
  //    Re-query to get only the truly active pending ones.
  const pendingRows = await models.HelicopterBookedSeat.findAll({
    where: {
      helicopter_schedule_id: schedule_id,
      bookDate,
    },
    include: [{
      model: models.HelicopterBooking,
      attributes: ['id', 'bookingStatus', 'created_at'],
      where: { bookingStatus: 'PENDING' },
      required: true,
    }],
    attributes: ['seat_label', 'helicopter_booking_id'],
    transaction,
  }).catch(() => []);

  // Filter pending seats: only keep those whose booking hasn't expired yet
  const expiredPendingIds = new Set(
    pendingRows
      .filter(row => {
        const booking = row.HelicopterBooking;
        if (!booking) return true; // treat as expired if no booking found
        const createdAt = new Date(booking.created_at);
        const ageMs = now - createdAt;
        // Expired if older than 20 minutes
        return ageMs > 20 * 60 * 1000;
      })
      .map(row => row.helicopter_booking_id)
  );

  // 4. Seats held via HelicopterSeatHold table (temporary holds during checkout)
  let heldSeats = new Set();
  try {
    const holdWhere = {
      schedule_id,
      bookDate,
      expires_at: { [models.Sequelize.Op.gt]: now },
    };
    if (userId) {
      holdWhere.held_by = { [models.Sequelize.Op.ne]: userId };
    }
    const holdRows = await models.HelicopterSeatHold.findAll({
      where: holdWhere,
      attributes: ['seat_label'],
      transaction,
    });
    heldSeats = new Set(holdRows.map(r => r.seat_label));
  } catch {
    // HelicopterSeatHold table may not exist — safe to ignore
  }

  // 5. Build the unavailable set
  const unavailable = new Set();

  for (const row of confirmedRows) {
    // Skip seats from expired pending bookings
    if (expiredPendingIds.has(row.helicopter_booking_id)) continue;
    unavailable.add(row.seat_label);
  }

  for (const seat of heldSeats) {
    unavailable.add(seat);
  }

  const availableSeats = allSeats.filter(seat => !unavailable.has(seat));

  console.log(
    `[Helicopter Seats] schedule=${schedule_id} date=${bookDate} ` +
    `total=${seatLimit} booked=${unavailable.size} available=${availableSeats.length} [${availableSeats.join(',')}]`
  );

  return availableSeats;
}

/**
 * Count available helicopter seats for a specific schedule and date
 * @param {Object} params - Parameters object
 * @param {Object} params.models - Sequelize models
 * @param {number} params.schedule_id - Helicopter schedule ID
 * @param {string} params.bookDate - Booking date (YYYY-MM-DD)
 * @param {Object} params.transaction - Optional database transaction
 * @returns {Promise<number>} Number of available seats
 */
async function sumHelicopterSeats({ models, schedule_id, bookDate, transaction = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate)) {
    throw new Error('bookDate must be YYYY-MM-DD');
  }
  const availableSeats = await getAvailableHelicopterSeats({ models, schedule_id, bookDate, transaction });
  return availableSeats.length;
}

module.exports = {
  getAvailableHelicopterSeats,
  sumHelicopterSeats,
  generateHelicopterSeatLabels,
  getHelicopterRoute,
};
