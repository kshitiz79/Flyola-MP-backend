const SEG_CACHE = new WeakMap();

function getRoute(flight) {
  if (SEG_CACHE.has(flight)) return SEG_CACHE.get(flight);
  let stops = [];
  try {
    stops = Array.isArray(flight.airport_stop_ids)
      ? flight.airport_stop_ids
      : JSON.parse(flight.airport_stop_ids || '[]');
  } catch (e) {
  }
  const route = [flight.start_airport_id, ...stops, flight.end_airport_id];
  SEG_CACHE.set(flight, route);
  return route;
}

function generateSeatLabels(seatLimit) {
  const seats = [];
  for (let i = 1; i <= seatLimit; i++) {
    seats.push(`S${i}`);
  }
  return seats;
}

async function getAvailableSeats({ models, schedule_id, bookDate, userId = null, transaction = null }) {
  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
    transaction,
  });
  if (!schedule || !schedule.Flight) {
    return [];
  }
  const flight = schedule.Flight;

  const allSeats = generateSeatLabels(flight.seat_limit);

  const route = getRoute(flight);
  const depIdx = route.indexOf(schedule.departure_airport_id);
  const arrIdx = route.lastIndexOf(schedule.arrival_airport_id);
  if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
    return [];
  }

  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    attributes: ['id', 'departure_airport_id', 'arrival_airport_id'],
    transaction,
  });

  const relevantScheduleIds = allSchedules
    .filter((s) => {
      const sDepIdx = route.indexOf(s.departure_airport_id);
      const sArrIdx = route.lastIndexOf(s.arrival_airport_id);
      return (
        sDepIdx !== -1 &&
        sArrIdx !== -1 &&
        sDepIdx < sArrIdx &&
        !(sArrIdx < depIdx || sDepIdx > arrIdx)
      );
    })
    .map((s) => s.id);

  const bookedSeatsRows = await models.BookedSeat.findAll({
    where: {
      schedule_id: relevantScheduleIds,
      bookDate,
    },
    attributes: ['seat_label'],
    transaction,
  });

  const now = new Date();
  let heldSeatsRows;
  if (userId) {
    heldSeatsRows = await models.SeatHold.findAll({
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
    heldSeatsRows = await models.SeatHold.findAll({
      where: {
        schedule_id: relevantScheduleIds,
        bookDate,
        expires_at: { [models.Sequelize.Op.gt]: now },
      },
      attributes: ['seat_label'],
      transaction,
    });
  }

  const bookedSeats = new Set(bookedSeatsRows.map((row) => row.seat_label));
  const heldByOthers = new Set(heldSeatsRows.map((row) => row.seat_label));
  const unavailableSeats = new Set([...bookedSeats, ...heldByOthers]);

  const availableSeats = allSeats.filter((seat) => !unavailableSeats.has(seat));
  return availableSeats;
}

async function sumSeats({ models, schedule_id, bookDate, transaction = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate)) {
    throw new Error('bookDate must be YYYY-MM-DD');
  }
  const availableSeats = await getAvailableSeats({ models, schedule_id, bookDate, transaction });
  return availableSeats.length;
}

module.exports = {
  sumSeats,
  generateSeatLabels,
  getAvailableSeats,
};
