const SEG_CACHE = new WeakMap();

/**
 * Get the complete route for a helicopter including all stops
 * @param {Object} helicopter - Helicopter model instance
 * @returns {Array} Array of helipad IDs representing the route
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
  
  // Filter out invalid stops
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
 * Get available helicopter seats for a specific schedule and date
 * Handles multi-leg routes by checking ALL overlapping segments
 * @param {Object} params - Parameters object
 * @param {Object} params.models - Sequelize models
 * @param {number} params.schedule_id - Helicopter schedule ID
 * @param {string} params.bookDate - Booking date (YYYY-MM-DD)
 * @param {string} params.userId - Optional user ID for seat holds
 * @param {Object} params.transaction - Optional database transaction
 * @returns {Promise<Array>} Array of available seat labels
 */
async function getAvailableHelicopterSeats({ models, schedule_id, bookDate, userId = null, transaction = null }) {
  const schedule = await models.HelicopterSchedule.findByPk(schedule_id, {
    include: [{ model: models.Helicopter, as: 'Helicopter' }],
    transaction,
  });
  
  if (!schedule || !schedule.Helicopter) {
    return [];
  }
  
  const helicopter = schedule.Helicopter;
  const seatLimit = helicopter.seat_limit || 6;
  
  // Generate all possible seat labels
  const allSeats = generateHelicopterSeatLabels(seatLimit);
  
  // Get the helicopter route
  const route = getHelicopterRoute(helicopter);
  const depIdx = route.indexOf(schedule.departure_helipad_id);
  const arrIdx = route.lastIndexOf(schedule.arrival_helipad_id);
  
  if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
    return [];
  }
  
  // Get ALL schedules for this helicopter
  const allSchedules = await models.HelicopterSchedule.findAll({
    where: { helicopter_id: helicopter.id },
    attributes: ['id', 'departure_helipad_id', 'arrival_helipad_id'],
    transaction,
  });
  
  // Find schedules that overlap with the requested schedule
  const relevantScheduleIds = allSchedules
    .filter((s) => {
      const sDepIdx = route.indexOf(s.departure_helipad_id);
      const sArrIdx = route.lastIndexOf(s.arrival_helipad_id);
      return (
        sDepIdx !== -1 &&
        sArrIdx !== -1 &&
        sDepIdx < sArrIdx &&
        // Check if segments overlap: !(segment ends before ours starts OR segment starts after ours ends)
        !(sArrIdx < depIdx || sDepIdx > arrIdx)
      );
    })
    .map((s) => s.id);
  
  // Check booked seats across ALL overlapping schedules
  const bookedSeatsRows = await models.HelicopterBookedSeat.findAll({
    where: {
      helicopter_schedule_id: relevantScheduleIds,
      bookDate,
    },
    attributes: ['seat_label'],
    transaction,
  });
  
  // Check held seats across ALL overlapping schedules
  const now = new Date();
  let heldSeatsRows = [];
  try {
    if (userId) {
      heldSeatsRows = await models.HelicopterSeatHold.findAll({
        where: {
          schedule_id: relevantScheduleIds,
          bookDate,
          expires_at: { [models.Sequelize.Op.gt]: now },
          held_by: { [models.Sequelize.Op.ne]: userId },
        },
        attributes: ['seat_label'],
        transaction,
      });
    } else {
      heldSeatsRows = await models.HelicopterSeatHold.findAll({
        where: {
          schedule_id: relevantScheduleIds,
          bookDate,
          expires_at: { [models.Sequelize.Op.gt]: now },
        },
        attributes: ['seat_label'],
        transaction,
      });
    }
  } catch (error) {
    // HelicopterSeatHold table might not exist, ignore
    console.warn('HelicopterSeatHold table not found or error:', error.message);
  }
  
  const bookedSeats = new Set(bookedSeatsRows.map((row) => row.seat_label));
  const heldByOthers = new Set(heldSeatsRows.map((row) => row.seat_label));
  const unavailableSeats = new Set([...bookedSeats, ...heldByOthers]);
  
  const availableSeats = allSeats.filter((seat) => !unavailableSeats.has(seat));
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
