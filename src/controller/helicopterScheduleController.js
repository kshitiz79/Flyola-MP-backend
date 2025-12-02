const { format, toZonedTime } = require('date-fns-tz');
// Removed unused import: const { getAvailableSeats } = require('../utils/seatUtils');

// Helper function to safely parse via_stop_id
function parseViaStopIds(viaStopIdRaw, scheduleId) {
  let viaStopIds = [];
  try {
    // Handle different data types
    if (viaStopIdRaw) {
      if (Array.isArray(viaStopIdRaw)) {
        // Already an array
        viaStopIds = viaStopIdRaw;
      } else if (typeof viaStopIdRaw === 'string' && viaStopIdRaw.trim() !== '') {
        // Parse JSON string
        const parsed = JSON.parse(viaStopIdRaw);
        viaStopIds = Array.isArray(parsed) ? parsed : [];
      } else if (typeof viaStopIdRaw === 'object') {
        // Handle object case
        viaStopIds = [];
      }
    }
    viaStopIds = viaStopIds.filter((id) => id && Number.isInteger(id) && id !== 0);
  } catch (e) {
    // Only log error for non-empty strings
    if (viaStopIdRaw && typeof viaStopIdRaw === 'string' && viaStopIdRaw.trim() !== '') {
    }
    viaStopIds = [];
  }
  return viaStopIds;
}

// Helicopter-specific seat availability function
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
  
  // Generate seat labels (S1, S2, etc.)
  const allSeats = [];
  for (let i = 1; i <= seatLimit; i++) {
    allSeats.push(`S${i}`);
  }
  
  // Get booked seats for this helicopter schedule on this date
  const bookedSeatsRows = await models.BookedSeat.findAll({
    where: {
      schedule_id: schedule_id,
      bookDate,
    },
    attributes: ['seat_label'],
    transaction,
  });
  
  // Get held seats (if SeatHold table exists)
  const now = new Date();
  let heldSeatsRows = [];
  try {
    if (userId) {
      heldSeatsRows = await models.SeatHold.findAll({
        where: {
          schedule_id: schedule_id,
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
          schedule_id: schedule_id,
          bookDate,
          expires_at: { [models.Sequelize.Op.gt]: now },
        },
        attributes: ['seat_label'],
        transaction,
      });
    }
  } catch (error) {
    // SeatHold table might not exist, ignore
  }
  
  const bookedSeats = new Set(bookedSeatsRows.map((row) => row.seat_label));
  const heldByOthers = new Set(heldSeatsRows.map((row) => row.seat_label));
  const unavailableSeats = new Set([...bookedSeats, ...heldByOthers]);
  
  const availableSeats = allSeats.filter((seat) => !unavailableSeats.has(seat));
  return availableSeats;
}
const getModels = () => require('../model');

async function getHelicopterSchedules(req, res) {
  const models = getModels();
  const isUserRequest = req.query.user === 'true';
  const monthQuery = req.query.month;
  
  try {
    const where = isUserRequest ? { status: 1 } : {};
    const rows = await models.HelicopterSchedule.findAll({
      where,
      include: [{ model: models.Helicopter, as: 'Helicopter' }],
    });

    let output = [];
    if (monthQuery) {
      const [year, month] = monthQuery.split('-').map(Number);
      const startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
      const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const departure_date = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
        const weekday = format(d, 'EEEE', { timeZone: 'Asia/Kolkata' });

        for (const schedule of rows) {
          const helicopter = schedule.Helicopter;
          if (!helicopter || helicopter.departure_day !== weekday) continue;

          const viaStopIds = parseViaStopIds(schedule.via_stop_id, schedule.id);

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableHelicopterSeats({
              models,
              schedule_id: schedule.id,
              bookDate: departure_date,
              transaction: null,
            });
            availableSeats = seats.length;
          } catch (error) {
            seatError = error.message;
          }

          output.push({
            ...schedule.toJSON(),
            via_stop_id: JSON.stringify(viaStopIds),
            departure_date,
            availableSeats,
            seatError: seatError || undefined,
          });
        }
      }
    } else {
      const bookDate = req.query.date || format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });
      const results = await Promise.all(
        rows.map(async (schedule) => {
          const helicopter = schedule.Helicopter;
          if (!helicopter) {
            return null;
          }

          const viaStopIds = parseViaStopIds(schedule.via_stop_id, schedule.id);

          let availableSeats = 0;
          let seatError = null;
          try {
            const seats = await getAvailableHelicopterSeats({
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

async function addHelicopterSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_helipad_id, arrival_helipad_id, helicopter_id, ...body } = req.body;
  
  try {
    // Validate helicopter exists
    const helicopter = await models.Helicopter.findByPk(helicopter_id);
    if (!helicopter) {
      return res.status(400).json({ error: 'Helicopter not found' });
    }

    // Validate helipads exist in the helipads table
    const departureLocation = await models.Helipad.findByPk(departure_helipad_id);
    const arrivalLocation = await models.Helipad.findByPk(arrival_helipad_id);
    
    if (!departureLocation) {
      return res.status(400).json({ error: 'Departure helipad not found' });
    }
    if (!arrivalLocation) {
      return res.status(400).json({ error: 'Arrival helipad not found' });
    }

    const validViaStopIds = via_stop_id
      ? JSON.parse(via_stop_id).filter((id) => id && Number.isInteger(id) && id !== 0)
      : [];

    const schedule = await models.HelicopterSchedule.create({
      ...body,
      departure_helipad_id,
      arrival_helipad_id,
      helicopter_id,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    
    res.status(201).json({ id: schedule.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add helicopter schedule', details: err.message });
  }
}

async function updateHelicopterSchedule(req, res) {
  const models = getModels();
  const { via_stop_id, departure_helipad_id, arrival_helipad_id, helicopter_id, ...body } = req.body;
  
  try {
    const schedule = await models.HelicopterSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const targetHelicopterId = helicopter_id || schedule.helicopter_id;
    const helicopter = await models.Helicopter.findByPk(targetHelicopterId);
    if (!helicopter) {
      return res.status(400).json({ error: `Helicopter not found for ID: ${targetHelicopterId}` });
    }

    const depId = departure_helipad_id || schedule.departure_helipad_id;
    const arrId = arrival_helipad_id || schedule.arrival_helipad_id;

    // Validate helipads exist in the helipads table
    const departureLocation = await models.Helipad.findByPk(depId);
    const arrivalLocation = await models.Helipad.findByPk(arrId);
    
    if (!departureLocation) {
      return res.status(400).json({ error: `Departure helipad not found for ID: ${depId}` });
    }
    if (!arrivalLocation) {
      return res.status(400).json({ error: `Arrival helipad not found for ID: ${arrId}` });
    }

    let validViaStopIds = [];
    if (via_stop_id) {
      try {
        const parsed = JSON.parse(via_stop_id);
        validViaStopIds = Array.isArray(parsed) ? parsed.filter(
          (id) => id && Number.isInteger(id) && id !== 0
        ) : [];
        const helipadLocations = await models.Helipad.findAll({
          where: { id: validViaStopIds },
          attributes: ['id'],
        });
        validViaStopIds = validViaStopIds.filter((id) => helipadLocations.map((h) => h.id).includes(id));
      } catch (e) {
        return res.status(400).json({ error: 'Invalid via_stop_id format' });
      }
    } else {
      validViaStopIds = parseViaStopIds(schedule.via_stop_id, req.params.id);
    }

    await schedule.update({
      ...body,
      departure_helipad_id: depId,
      arrival_helipad_id: arrId,
      helicopter_id: targetHelicopterId,
      via_stop_id: JSON.stringify(validViaStopIds),
    });
    
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update schedule', details: err.message });
  }
}

async function deleteHelicopterSchedule(req, res) {
  const models = getModels();
  try {
    const schedule = await models.HelicopterSchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    await schedule.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
}

async function getSchedulePriceByDay(req, res) {
  const models = getModels();
  const scheduleId = req.query.schedule_id || req.params.id;
  const monthQuery = req.query.month;
  const startDateParam = req.query.start_date;

  if (!scheduleId) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }

  try {
    const schedule = await models.HelicopterSchedule.findByPk(scheduleId, {
      include: [{ model: models.Helicopter, as: 'Helicopter' }],
    });

    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!schedule.Helicopter) return res.status(404).json({ error: 'Associated Helicopter not found' });

    const price = parseFloat(schedule.price);
    const departureDay = schedule.Helicopter.departure_day;
    if (!departureDay) {
      return res.status(400).json({ error: 'Helicopter departure day not defined' });
    }

    let year, month;
    if (monthQuery) {
      [year, month] = monthQuery.split('-').map(Number);
    } else {
      const now = toZonedTime(new Date(), 'Asia/Kolkata');
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    let startDate = toZonedTime(new Date(year, month - 1, 1), 'Asia/Kolkata');
    const endDate = toZonedTime(new Date(year, month, 0), 'Asia/Kolkata');

    if (startDateParam) {
      const parsedStart = toZonedTime(new Date(startDateParam), 'Asia/Kolkata');
      if (!isNaN(parsedStart)) {
        if (parsedStart > startDate) {
          startDate = parsedStart;
        }
      }
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
      return res.status(400).json({ error: 'Invalid helicopter departure day' });
    }

    const viaStopIds = parseViaStopIds(schedule.via_stop_id, schedule.id);

    const priceByDay = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === targetWeekday) {
        const dateStr = format(d, 'yyyy-MM-dd', { timeZone: 'Asia/Kolkata' });

        let availableSeats = 0;
        let seatError = null;
        try {
          const seats = await getAvailableHelicopterSeats({
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

async function getScheduleBetweenHelipadDate(req, res) {
  const models = getModels();
  const { departure_helipad_id, arrival_helipad_id, date } = req.query;

  if (!departure_helipad_id || !arrival_helipad_id || !date) {
    return res.status(400).json({
      success: false,
      error: 'departure_helipad_id, arrival_helipad_id, and date are required',
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
    const schedules = await models.HelicopterSchedule.findAll({
      where: {
        departure_helipad_id,
        arrival_helipad_id,
        status: 1,
      },
      include: [
        {
          model: models.Helicopter,
          as: 'Helicopter',
          where: { departure_day: weekday },
          required: true,
        },
      ],
    });

    if (schedules.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No active helicopter schedules found for the given criteria',
        data: [],
      });
    }

    // Process results
    const output = await Promise.all(
      schedules.map(async (schedule) => {
        const viaStopIds = parseViaStopIds(schedule.via_stop_id, schedule.id);

        let availableSeats = 0;
        let seatError = null;
        try {
          const seats = await getAvailableHelicopterSeats({
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

    return res.status(200).json({
      success: true,
      message: 'Helicopter schedules fetched successfully',
      data: output,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to get active helicopter schedules by helipad and date',
      details: err.message,
    });
  }
}

module.exports = {
  getHelicopterSchedules,
  addHelicopterSchedule,
  updateHelicopterSchedule,
  deleteHelicopterSchedule,
  getSchedulePriceByDay,
  getScheduleBetweenHelipadDate,
};