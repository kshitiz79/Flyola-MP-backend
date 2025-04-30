const SEG_CACHE = new WeakMap();

function getRoute(flight) {
  if (SEG_CACHE.has(flight)) return SEG_CACHE.get(flight);
  const stops = Array.isArray(flight.airport_stop_ids)
    ? flight.airport_stop_ids
    : JSON.parse(flight.airport_stop_ids || '[]');
  const route = [flight.start_airport_id, ...stops, flight.end_airport_id];
  SEG_CACHE.set(flight, route);
  return route;
}

exports.sumSeats = async function sumSeats({ models, schedule_id, bookDate, transaction = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate)) {
    throw new Error('bookDate must be YYYY-MM-DD');
  }

  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
    transaction,
  });
  if (!schedule || !schedule.Flight) {
    throw new Error('Schedule or Flight not found');
  }
  const flight = schedule.Flight;

  const route = getRoute(flight);
  const depIdx = route.indexOf(schedule.departure_airport_id);
  const arrIdx = route.indexOf(schedule.arrival_airport_id);
  if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
    throw new Error(`Invalid dep/arr for schedule ${schedule_id}`);
  }

  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    transaction,
  });

  const bookedRows = await models.BookedSeat.findAll({
    where: {
      schedule_id: allSchedules.map((s) => s.id),
      bookDate,
    },
    transaction,
  });

  const loadPerSegment = Array(route.length - 1).fill(0);
  for (const row of bookedRows) {
    const seg = allSchedules.find((s) => s.id === row.schedule_id);
    if (!seg) continue;
    const start = route.indexOf(seg.departure_airport_id);
    const end = route.indexOf(seg.arrival_airport_id);
    if (start < 0 || end < 0 || start >= end) continue;

    for (let i = start; i < end; i++) {
      loadPerSegment[i] = Math.max(loadPerSegment[i], row.booked_seat);
    }
  }

  const sliceLoad = loadPerSegment.slice(depIdx, arrIdx);
  const maxBooked = Math.max(0, ...sliceLoad);

  return Math.max(0, flight.seat_limit - maxBooked);
};
