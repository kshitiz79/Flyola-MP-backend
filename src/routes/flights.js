const express = require('express');
const router = express.Router();
const pool = require('../../db');

// Utility functions
function getNextWeekday(weekday) {
  const weekdayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2,
    Wednesday: 3, Thursday: 4,
    Friday: 5, Saturday: 6
  };
  const now = new Date();
  const currentDay = now.getDay();
  const targetDay = weekdayMap[weekday];
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) daysToAdd += 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysToAdd);
  return nextDate;
}

function combineDateAndTime(dateObj, timeString) {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  const combined = new Date(dateObj);
  combined.setHours(hours, minutes, seconds || 0, 0);
  return combined;
}

async function updateFlightStatuses() {
  try {
    const now = new Date();
    const [flights] = await pool.query('SELECT id, departure_day, departure_time, status FROM flights');
    for (const flight of flights) {
      const datePart = getNextWeekday(flight.departure_day);
      const flightDateTime = combineDateAndTime(datePart, flight.departure_time);
      if (flightDateTime < now && flight.status === 0) {
        await pool.query('UPDATE flights SET status = 1 WHERE id = ?', [flight.id]);
      }
    }
  } catch (err) {
    console.error('Error updating flight statuses:', err);
  }
}

// Schedule status updates every 10 min
setInterval(updateFlightStatuses, 10 * 60 * 1000);

// Routes
router.get('/', async (req, res) => {
  try {
    await updateFlightStatuses();
    const [flights] = await pool.query('SELECT * FROM flights');
    res.json(flights);
  } catch (err) {
    console.error('Error during fetching flights:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

router.post('/', async (req, res) => {
  const { flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO flights (flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status]
    );
    res.status(201).json({ message: 'Flight added successfully', id: result.insertId });
  } catch (err) {
    console.error('Error during adding flight:', err);
    res.status(500).json({ error: 'Failed to add flight' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status } = req.body;
  try {
    await pool.query(
      'UPDATE flights SET flight_number = ?, departure_day = ?, start_airport_id = ?, end_airport_id = ?, airport_stop_ids = ?, seat_limit = ?, status = ? WHERE id = ?',
      [flight_number, departure_day, start_airport_id, end_airport_id, airport_stop_ids, seat_limit, status, id]
    );
    res.json({ message: 'Flight updated successfully' });
  } catch (err) {
    console.error('Error during updating flight:', err);
    res.status(500).json({ error: 'Failed to update flight' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM flights WHERE id = ?', [id]);
    res.json({ message: 'Flight deleted successfully' });
  } catch (err) {
    console.error('Error during deleting flight:', err);
    res.status(500).json({ error: 'Failed to delete flight' });
  }
});

module.exports = router;
