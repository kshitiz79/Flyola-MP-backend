const getModels = () => require('../model');

async function sumSeats({ models, schedule_id, bookDate, transaction }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookDate)) {
    console.error(`sumSeats - Invalid bookDate format: ${bookDate}`);
    return 0;
  }

  const schedule = await models.FlightSchedule.findByPk(schedule_id, {
    include: [{ model: models.Flight }],
    transaction,
  });
  if (!schedule || !schedule.Flight) {
    console.warn(`sumSeats - Schedule ${schedule_id} or Flight not found`);
    return 0;
  }

  const flight = schedule.Flight;
  let routeAirports;
  try {
    routeAirports = flight.airport_stop_ids
      ? JSON.parse(flight.airport_stop_ids)
      : [flight.start_airport_id, flight.end_airport_id];
    if (!Array.isArray(routeAirports) || routeAirports.length === 0 || routeAirports.includes(0)) {
      console.warn(
        `sumSeats - Invalid airport_stop_ids for flight ${flight.id}: ${flight.airport_stop_ids}. ` +
        `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
      );
      routeAirports = [flight.start_airport_id, flight.end_airport_id];
    }
  } catch (err) {
    console.error(
      `sumSeats - Error parsing airport_stop_ids for flight ${flight.id}: ${err.message}. ` +
      `Falling back to start_airport_id=${flight.start_airport_id}, end_airport_id=${flight.end_airport_id}`
    );
    routeAirports = [flight.start_airport_id, flight.end_airport_id];
  }

  console.log(
    `sumSeats - Schedule ${schedule_id}, flight_id=${flight.id}, ` +
    `seat_limit=${flight.seat_limit}, routeAirports=${JSON.stringify(routeAirports)}, ` +
    `departure_airport_id=${schedule.departure_airport_id}, ` +
    `arrival_airport_id=${schedule.arrival_airport_id}`
  );

  const segmentStartIndex = routeAirports.indexOf(schedule.departure_airport_id);
  const segmentEndIndex = routeAirports.indexOf(schedule.arrival_airport_id);
  if (segmentStartIndex === -1 || segmentEndIndex === -1 || segmentStartIndex >= segmentEndIndex) {
    console.warn(
      `sumSeats - Invalid segment indices for schedule ${schedule_id}, ` +
      `startIndex=${segmentStartIndex}, endIndex=${segmentEndIndex}. Using direct segment`
    );
    const bookedSeat = await models.BookedSeat.findOne({
      where: { schedule_id, bookDate },
      transaction,
    });
    const booked = bookedSeat ? bookedSeat.booked_seat : 0;
    const seatsLeft = Math.max(0, flight.seat_limit - booked);
    console.log(
      `sumSeats - Schedule ${schedule_id}, bookDate=${bookDate}, booked=${booked}, ` +
      `seatsLeft=${seatsLeft}, record=${bookedSeat ? JSON.stringify({ id: bookedSeat.id, booked_seat: bookedSeat.booked_seat }) : 'none'}`
    );
    return seatsLeft;
  }

  const allSchedules = await models.FlightSchedule.findAll({
    where: { flight_id: flight.id },
    transaction,
  });

  const overlappingSchedules = allSchedules.filter((s) => {
    const startIndex = routeAirports.indexOf(s.departure_airport_id);
    const endIndex = routeAirports.indexOf(s.arrival_airport_id);
    const isOverlapping =
      startIndex !== -1 &&
      endIndex !== -1 &&
      startIndex <= segmentStartIndex &&
      endIndex >= segmentEndIndex &&
      startIndex < endIndex;
    console.log(
      `sumSeats - Schedule ${s.id}, startIndex=${startIndex}, endIndex=${endIndex}, ` +
      `isOverlapping=${isOverlapping}, departure=${s.departure_airport_id}, arrival=${s.arrival_airport_id}`
    );
    return isOverlapping;
  });

  let totalBooked = 0;
  const bookedDetails = [];
  for (const s of overlappingSchedules) {
    const bookedSeat = await models.BookedSeat.findOne({
      where: { schedule_id: s.id, bookDate },
      transaction,
    });
    const booked = bookedSeat ? bookedSeat.booked_seat : 0;
    bookedDetails.push({ schedule_id: s.id, booked_seat: booked });
    totalBooked += booked;
    console.log(
      `sumSeats - Schedule ${s.id}, bookDate=${bookDate}, booked=${booked}, ` +
      `record=${bookedSeat ? JSON.stringify({ id: bookedSeat.id, booked_seat: bookedSeat.booked_seat }) : 'none'}`
    );
  }

  const seatsLeft = Math.max(0, flight.seat_limit - totalBooked);
  console.log(
    `sumSeats - Schedule ${schedule_id}, bookDate=${bookDate}, ` +
    `seat_limit=${flight.seat_limit}, totalBooked=${totalBooked}, seatsLeft=${seatsLeft}, ` +
    `bookedDetails=`,
    bookedDetails
  );

  return seatsLeft;
}

module.exports = { sumSeats };