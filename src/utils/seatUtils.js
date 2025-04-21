/**
 * utils/seatUtils.js
 *
 *  seatLeft = seat_limit − maxConcurrentBookingsOnAnySegment
 *  ────────────────────────────────────────────────────────────
 *  • A booking counts on every *segment* it covers
 *    (segment = leg between two consecutive airports).
 *  • We build an array “loadPerSegment[]”, add the booked_seat
 *    value to each relevant segment, then take Math.max().
 */
const SEG_CACHE = new WeakMap();

/** Parse the flight’s ordered airport list only once per Flight instance */
function getRoute(flight) {
  if (SEG_CACHE.has(flight)) return SEG_CACHE.get(flight);
  const stops = Array.isArray(flight.airport_stop_ids)
    ? flight.airport_stop_ids
    : JSON.parse(flight.airport_stop_ids || '[]');
  const route = [flight.start_airport_id, ...stops, flight.end_airport_id];
  SEG_CACHE.set(flight, route);
  return route;
}

/** Is schedule B’s segment overlapping schedule A’s segment? */
function overlaps(route, a, b) {
  const aStart = route.indexOf(a.dep), aEnd = route.indexOf(a.arr);
  const bStart = route.indexOf(b.dep), bEnd = route.indexOf(b.arr);
  return aStart < bEnd && bStart < aEnd;        // interval overlap (open‑right)
}

/**
 * seatsLeft({ models, schedule_id, bookDate [, transaction] })
 * ------------------------------------------------------------
 * Returns *remaining* seats for the requested schedule on the given date.
 */
exports.sumSeats = async ({ models, schedule_id, bookDate, transaction = null }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate))
    throw new Error('bookDate must be YYYY‑MM‑DD');

  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
    transaction,
  });
  if (!schedule || !schedule.Flight) throw new Error('Schedule or Flight not found');

  const flight   = schedule.Flight;
  const route    = getRoute(flight);

  // ── 1. All schedules of this flight
  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    transaction,
  });

  // ── 2. Build segment load array
  const segCount = route.length - 1;                  // e.g. A‑B‑C‑D ⇒ 3 segments
  const loadPerSegment = Array(segCount).fill(0);

  // helper: mark load on each segment index
  const addLoad = (s, load) => {
    const iStart = route.indexOf(s.dep);
    const iEnd   = route.indexOf(s.arr);              // points to stop, NOT segment
    for (let seg = iStart; seg < iEnd; seg++) {       // open‑right -> < iEnd
      loadPerSegment[seg] += load;
    }
  };

  // ── 3. Accumulate booked seats per segment
  const bookedRows = await models.BookedSeat.findAll({
    where: { schedule_id: allSchedules.map(s => s.id), bookDate },
    transaction,
  });

  for (const row of bookedRows) {
    const s = allSchedules.find(x => x.id === row.schedule_id);
    addLoad(
      { dep: s.departure_airport_id, arr: s.arrival_airport_id },
      row.booked_seat
    );
  }

    // ► Only look at the segments this schedule REALLY covers
    const segStart = route.indexOf(schedule.departure_airport_id);
    const segEnd   = route.indexOf(schedule.arrival_airport_id);   // index of stop, not segment
    if (segStart === -1 || segEnd === -1 || segStart >= segEnd) {
      throw new Error(
        `sumSeats: schedule ${schedule_id} has invalid dep/arr indices in route`
      );
    }
  
    const sliceLoad = loadPerSegment.slice(segStart, segEnd);       // e.g. A→C ⇒ seg[0..1]
    const maxBooked = Math.max(0, ...sliceLoad);
    return Math.max(0, flight.seat_limit - maxBooked);
};
