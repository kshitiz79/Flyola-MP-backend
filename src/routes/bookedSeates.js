



// routes/users.js
const express = require('express');
const router = express.Router();

const db = require('./../../db');

// GET /users - Retrieve all users as JSON
router.get('/', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM booked_seats');
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});
router.post('/', async (req, res) => {
  const { schedule_id, bookDate, booked_seat, user_id } = req.body; 

  try {
    // Check if the seat is available for the given schedule
    const [existingBookings] = await pool.query(
      'SELECT SUM(booked_seat) as total_booked FROM booked_seats WHERE schedule_id = ? AND bookDate = ?',
      [schedule_id, bookDate]
    );

    const [flightSchedule] = await pool.query(
      'SELECT flight_id, seat_limit FROM flight_schedules WHERE id = ?',
      [schedule_id]
    );

    if (!flightSchedule.length) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    const flight = await pool.query('SELECT seat_limit FROM flights WHERE id = ?', [flightSchedule[0].flight_id]);
    const maxSeats = flight[0].seat_limit;

    const alreadyBooked = existingBookings[0].total_booked || 0;
    if (alreadyBooked + booked_seat > maxSeats) {
      return res.status(400).json({ error: 'No available seats for this flight schedule' });
    }

    // Insert the new booking
    const [result] = await pool.query(
      'INSERT INTO booked_seats (bookDate, schedule_id, booked_seat, created_at, updated_at, user_id) VALUES (?, ?, ?, NOW(), NOW(), ?)',
      [bookDate, schedule_id, booked_seat, user_id]
    );

    res.status(201).json({ message: 'Seat booked successfully', id: result.insertId });
  } catch (err) {
    console.error('Error during seat booking:', err);
    res.status(500).json({ error: 'Failed to book seat' });
  }
});

// Get all booked seats for a specific schedule
router.get('/:schedule_id', async (req, res) => {
  const { schedule_id } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM booked_seats WHERE schedule_id = ?',
      [schedule_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching booked seats:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});


module.exports = router;
