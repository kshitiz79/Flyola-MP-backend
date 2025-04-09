// routes/bookings.js
const express = require('express');
const router = express.Router();
const pool = require('../../db'); // Ensure you import the correct pool

// GET /bookings - Retrieve all bookings, optionally filtered by status
router.get('/', async (req, res) => {
  const status = req.query.status || 'All Booking'; // Default to 'All Booking' if no status is provided

  try {
    // Adjust the query based on the status parameter
    let query = 'SELECT * FROM bookings';
    let queryParams = [];

    if (status !== 'All Booking') {
      query += ' WHERE bookingStatus = ?';
      queryParams.push(status);
    }

    const [rows] = await pool.query(query, queryParams); // Use the promise-based query
    res.json(rows); // Send the result as JSON
  } catch (err) {
    console.error('Error during query:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

module.exports = router;
