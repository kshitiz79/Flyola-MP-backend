const { format, toZonedTime } = require('date-fns-tz');
const { getAvailableSeats } = require('../utils/seatUtils');
const getModels = () => require('../model');
const { getRouteAirports } = require('./flightController');

const getRoute = (flight) => {
  return getRouteAirports({
    start_airport_id: flight.start_airport_id,
    end_airport_id: flight.end_airport_id,
    airport_stop_ids: flight.airport_stop_ids,
  });
};

async function getFlightSchedules(req, res) {
  const models = getModels();
  const isUserRequest = req.query.user === 'true';
  const isAdminRequest = req.query.admin === 'true';
  const monthQuery = req.query.month;
  const startDateParam = req.query.start_date; // Support mobile app parameter
  try {
    const where = isUserRequest ? { status: 1 } : {};
    
    // For public/user requests, only show schedules with existing flights
    // For admin requests, show all schedules (including those with deleted flights)
    const includeOptions = {
      model: models.Flight,
      required: isUserRequest ? true : false // Public users only see schedules with valid flights
    };
    
    const rows = await models.FlightSchedule.findAll({
      where,
      include: [includeOptions],
    });

    let output = [];
    
    // Determine date range - support both 'month' and 'start_date' parameters
    let startDate, endDate;
    if (monthQuery) {
      const [year, month] = monthQuery.split('-').map(Number);
      startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');
    } else if (startDateParam) {
      // If start_date is provided, use it and calculate end of that month
      const parsedStart = toZonedTime(new Date(startDateParam), 'Asia/Kolkata');
      if (!isNaN(parsedStart)) {
        const year = parsedStart.getFullYear();
        const month = parsedStart.getMonth();
        startDate = parsedStart;
        endDate = toZonedTime(new Date(year, month + 1, 0), 'Asia/Kolkata');
      }
    }
    
    // Fetch exceptions for the date range if querying by month or start_date
    let exceptions = [];
    if (startDate && endDate) {
      exceptions = await models.FlightScheduleException.findAll({
        where: {
          exception_date: {
            [models.Sequelize.Op.between]: [
              format(startDate, 'yyyy-MM-dd'),
              format(endDate, 'yyyy-MM-dd')
            ]
          }
        }
      });
    }
    
    if (startDate && endDate) {

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const departure_date = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
        const weekday = format(d, 'EEEE', { timeZone: 'Asia/Kolkata' });

        for (const schedule of rows) {
          const flight = schedule.Flight;
          
          // Skip if flight is missing (shouldn't happen with required: true, but safety check)
          if (!flight) {
            continue;
          }
          
          // Handle one-time flights
          if (schedule.is_one_time === 1) {
            // Only include if specific_date matches current date
            if (schedule.specific_date !== departure_date) {
              continue;
            }
          } else {
            // Regular recurring schedule - check weekday
            if (flight.departure_day !== weekday) continue;
            
            // Check for exception on this date
            const exception = exceptions.find(
              e => e.schedule_id === schedule.id && e.exception_date === departure_date
            );
            
            // Skip if cancelled
            if (exception && exception.override_status === 0) {
              continue;
            }
          }

          let viaStopIds = [];
          try {
            viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
            viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
          } catch (e) {
          }

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableSeats({
              models,
              schedule_id: schedule.id,
              bookDate: departure_date,
              transaction: null,
            });
            availableSeats = seats.length;
          } catch (error) {
            seatError = error.message;
          }

          // Apply exception overrides if exists (only for recurring schedules)
          let finalSchedule = { ...schedule.toJSON() };
          let hasException = false;
          
          if (schedule.is_one_time === 0) {
            const exception = exceptions.find(
              e => e.schedule_id === schedule.id && e.exception_date === departure_date
            );
            
            if (exception) {
              hasException = true;
              // Apply overrides
              if (exception.override_price !== null) {
                finalSchedule.price = exception.override_price;
              }
              if (exception.override_departure_time !== null) {
                finalSchedule.departure_time = exception.override_departure_time;
              }
              if (exception.override_arrival_time !== null) {
                finalSchedule.arrival_time = exception.override_arrival_time;
              }
              if (exception.override_status !== null) {
                finalSchedule.status = exception.override_status;
              }
            }
          }

          output.push({
            ...finalSchedule,
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date,
            availableSeats,
            seatError: seatError || undefined,
            is_special_flight: schedule.is_one_time === 1,
            has_exception: hasException,
            exception_type: hasException ? exceptions.find(e => e.schedule_id === schedule.id && e.exception_date === departure_date)?.exception_type : null,
          });
        }
      }
    } else {
      const bookDate = req.query.date || format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      const weekday = format(new Date(bookDate), 'EEEE', { timeZone: 'Asia/Kolkata' });
      
      const results = await Promise.all(
        rows.map(async (schedule) => {
          const flight = schedule.Flight;
          
          // Skip if flight is missing (shouldn't happen with required: true, but safety check)
          if (!flight) {
            return null;
          }
          
          // Handle one-time flights
          if (schedule.is_one_time === 1) {
            if (schedule.specific_date !== bookDate) {
              return null;
            }
          } else {
            // Regular recurring schedule
            if (flight.departure_day !== weekday) {
              return null;
            }
          }

          let viaStopIds = [];
          try {
            viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
            viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
          } catch (e) {
          }

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableSeats({
              models,
              schedule_id: schedule.id,
              bookDate,
              transaction: null,
            });
            availableSeats = seats.length;
          } catch (error) {
            seatError = error.message;
          }

          return {
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date: bookDate,
            availableSeats,
            seatError: seatError || undefined,
            is_special_flight: schedule.is_one_time === 1,
          };
        })
      );
      output = results.filter((item) => item);
    }

    res.json(output);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
}

async function addFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_airport_id, arrival_airport_id, flight_id, is_one_time, specific_date, ...body } = req.body;
  try {
    // Validation for one-time flights
    if (is_one_time === 1 || is_one_time === true || is_one_time === '1') {
      if (!specific_date) {
        return res.status(400).json({ error: 'specific_date is required for one-time flights' });
      }
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(specific_date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      
      // Ensure date is not in the past
      const today = format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      if (specific_date < today) {
        return res.status(400).json({ error: 'specific_date must be today or in the future' });
      }
    }
    
    // Validate departure and arrival airports
    const flight = await models.Flight.findByPk(flight_id);
    if (!flight) {
      return res.status(400).json({ error: 'Flight not found' });
    }
    const route = getRoute(flight);
    if (!route.includes(departure_airport_id) || !route.includes(arrival_airport_id)) {
      return res.status(400).json({ error: 'Invalid departure or arrival airport' });
    }
    const depIdx = route.indexOf(departure_airport_id);
    const arrIdx = route.lastIndexOf(arrival_airport_id);
    if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
      return res.status(400).json({ error: 'Departure must precede arrival in flight route' });
    }

    const validViaStopIds = via_stop_id
      ? JSON.parse(via_stop_id).filter((id) => id && Number.isInteger(id) && id !== 0)
      : [];

    const schedule = await models.FlightSchedule.create({
      ...body,
      departure_airport_id,
      arrival_airport_id,
      flight_id,
      via_stop_id: JSON.stringify(validViaStopIds),
      is_one_time: is_one_time ? 1 : 0,
      specific_date: is_one_time ? specific_date : null,
    });
    res.status(201).json({ 
      id: schedule.id,
      message: is_one_time 
        ? `One-time special flight created for ${specific_date}` 
        : 'Recurring schedule created'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add flight schedule', details: err.message });
  }
}

async function updateFlightSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_airport_id, arrival_airport_id, flight_id, ...body } = req.body;
  try {
    const schedule = await models.FlightSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const targetFlightId = flight_id || schedule.flight_id;
    const flight = await models.Flight.findByPk(targetFlightId);
    if (!flight) {
      return res.status(400).json({ error: `Flight not found for ID: ${targetFlightId}` });
    }

    const depId = departure_airport_id || schedule.departure_airport_id;
    const arrId = arrival_airport_id || schedule.arrival_airport_id;
    const route = getRoute(flight);

    if (route.length > 0) {
      if (!route.includes(depId) || !route.includes(arrId)) {
        return res.status(400).json({ error: `Invalid departure (ID: ${depId}) or arrival (ID: ${arrId}) airport` });
      }
      const depIdx = route.indexOf(depId);
      const arrIdx = route.lastIndexOf(arrId);
      if (depIdx < 0 || arrIdx < 0 || depIdx >= arrIdx) {
        return res.status(400).json({ error: 'Departure must precede arrival in flight route' });
      }
    } else {
    }

    let validViaStopIds = [];
    if (via_stop_id) {
      try {
        validViaStopIds = JSON.parse(via_stop_id).filter(
          (id) => id && Number.isInteger(id) && id !== 0
        );
        const airports = await models.Airport.findAll({
          where: { id: validViaStopIds },
          attributes: ['id'],
        });
        validViaStopIds = validViaStopIds.filter((id) => airports.map((a) => a.id).includes(id));
      } catch (e) {
        return res.status(400).json({ error: 'Invalid via_stop_id format' });
      }
    } else {
      try {
        validViaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
      } catch (e) {
        validViaStopIds = [];
      }
    }

    await schedule.update({
      ...body,
      departure_airport_id: depId,
      arrival_airport_id: arrId,
      flight_id: targetFlightId,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update schedule', details: err.message });
  }
}

async function deleteFlightSchedule(req, res) {
  const models = getModels();
  try {
    const schedule = await models.FlightSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    await schedule.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
}

async function activateAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.update({ status: 1 }, { where: {} });
    res.json({ message: 'All flight schedules activated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate all' });
  }
}

async function editAllFlightSchedules(req, res) {
  const models = getModels();
  const { price } = req.body;
  if (!price || isNaN(price)) return res.status(400).json({ error: 'Invalid price' });
  try {
    await models.FlightSchedule.update(
      { price: parseFloat(price) },
      { where: {} }
    );
    res.json({ message: 'All flight schedules updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update all' });
  }
}

async function deleteAllFlightSchedules(req, res) {
  const models = getModels();
  try {
    await models.FlightSchedule.destroy({ where: {} });
    res.json({ message: 'All flight schedules deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all' });
  }
}

async function updateFlightStops(req, res) {
  const models = getModels();
  const { flight_id, airport_stop_ids } = req.body;
  try {
    const flight = await models.Flight.findByPk(flight_id);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    let stops;
    try {
      stops = Array.isArray(airport_stop_ids) ? airport_stop_ids : JSON.parse(airport_stop_ids || '[]');
      stops = [...new Set(stops.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    } catch (e) {
      stops = [];
    }
    await flight.update({ airport_stop_ids: JSON.stringify(stops) });
    res.json({ message: 'Flight stops updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update flight stops' });
  }
}

async function getSchedulePriceByDay(req, res) {
  const models = getModels();
  const scheduleId = req.query.schedule_id || req.params.id;
  const monthQuery = req.query.month;
  const startDateParam = req.query.start_date; // New parameter

  if (!scheduleId) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }

  try {
    const schedule = await models.FlightSchedule.findByPk(scheduleId, {
      include: [{ model: models.Flight }],
    });

    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!schedule.Flight) return res.status(404).json({ error: 'Associated Flight not found' });

    const price = parseFloat(schedule.price);
    const departureDay = schedule.Flight.departure_day;
    if (!departureDay) {
      return res.status(400).json({ error: 'Flight departure day not defined' });
    }

    let year, month, startDate, endDate;
    
    if (monthQuery) {
      // Use month parameter
      [year, month] = monthQuery.split('-').map(Number);
      startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');
    } else if (startDateParam) {
      // Use start_date parameter - derive month from it
      const parsedStart = toZonedTime(new Date(startDateParam), 'Asia/Kolkata');
      if (!isNaN(parsedStart)) {
        year = parsedStart.getFullYear();
        month = parsedStart.getMonth() + 1;
        startDate = parsedStart;
        endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');
      } else {
        return res.status(400).json({ error: 'Invalid start_date format' });
      }
    } else {
      // Default to current month
      const now = toZonedTime(new Date(), 'Asia/Kolkata');
      year = now.getFullYear();
      month = now.getMonth() + 1;
      startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');
    }

    const weekdayMap = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    const targetWeekday = weekdayMap[departureDay];
    if (targetWeekday === undefined) {
      return res.status(400).json({ error: 'Invalid flight departure day' });
    }

    let viaStopIds = [];
    try {
      viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
      viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
    } catch (e) {
    }

    const priceByDay = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === targetWeekday) {
        const dateStr = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });

        let availableSeats = 0;
        let seatError = null;
        try {
          const seats = await getAvailableSeats({
            models,
            schedule_id: schedule.id,
            bookDate: dateStr,
            transaction: null,
          });
          availableSeats = seats.length;
        } catch (error) {
          seatError = error.message;
        }

        priceByDay.push({
          date: dateStr,
          price,
          schedule: {
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            availableSeats,
            seatError: seatError || undefined,
          },
        });
      }
    }

    res.json(priceByDay);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get prices by day', details: err.message });
  }
}




async function getScheduleBetweenAirportDate(req, res) {
  const models = getModels();
  const { departure_airport_id, arrival_airport_id, date } = req.query;

  if (!departure_airport_id || !arrival_airport_id || !date) {
    return res.status(400).json({
      success: false,
      error: 'departure_airport_id, arrival_airport_id, and date are required',
    });
  }

  try {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format, expected YYYY-MM-DD',
      });
    }

    // Parse the date in Asia/Kolkata timezone
    const queryDate = toZonedTime(new Date(date), 'Asia/Kolkata');
    const weekday = format(queryDate, 'EEEE', { timeZone: 'Asia/Kolkata' });

    // Find schedules
    const schedules = await models.FlightSchedule.findAll({
      where: {
        departure_airport_id,
        arrival_airport_id,
        status: 1,
      },
      include: [
        {
          model: models.Flight,
          where: { departure_day: weekday },
          required: true,
        },
      ],
    });

    if (schedules.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No active schedules found for the given criteria',
        data: [],
      });
    }

    // Process results
    const output = await Promise.all(
      schedules.map(async (schedule) => {
        let viaStopIds = [];
        try {
          viaStopIds = schedule.via_stop_id ? JSON.parse(schedule.via_stop_id) : [];
          viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
        } catch (e) {
        }

        let availableSeats = 0;
        let seatError = null;
        try {
          const seats = await getAvailableSeats({
            models,
            schedule_id: schedule.id,
            bookDate: date,
            transaction: null,
          });
          availableSeats = seats.length;
        } catch (error) {
          seatError = error.message;
        }

        return {
          ...schedule.toJSON(),
          via_stop_id: JSON.stringify(viaStopIds),
          departure_date: date,
          availableSeats,
          seatError: seatError || undefined,
        };
      })
    );

    // ✅ Success response
    return res.status(200).json({
      success: true,
      message: 'Schedules fetched successfully',
      data: output,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to get active schedules by airport and date',
      details: err.message,
    });
  }
}


// Get flight schedule by ID
async function getFlightScheduleById(req, res) {
  const models = getModels();
  try {
    const { id } = req.params;
    const schedule = await models.FlightSchedule.findByPk(id, {
      include: [{ model: models.Flight }],
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getFlightSchedules,
  getFlightScheduleById,
  addFlightSchedule,
  updateFlightSchedule,
  deleteFlightSchedule,
  activateAllFlightSchedules,
  editAllFlightSchedules,
  deleteAllFlightSchedules,
  updateFlightStops,
  getSchedulePriceByDay,
  getScheduleBetweenAirportDate,
};