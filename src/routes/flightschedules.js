const express = require('express');
const router = express.Router();
const pool = require('../../db');

// Get all flight schedules
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM flight_schedules');
    res.json(rows);
  } catch (err) {
    console.error('Error during fetching flight schedules:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Add a new flight schedule
router.post('/', async (req, res) => {
  const { flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO flight_schedules (flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, via_stop_id, via_schedule_id, status]
    );
    res.status(201).json({ message: 'Flight schedule added successfully', id: result.insertId });
  } catch (err) {
    console.error('Error during adding flight schedule:', err);
    res.status(500).json({ error: 'Failed to add flight schedule' });
  }
});

module.exports = router;
