const express = require('express');
const router = express.Router();
const pool = require('../../db'); // Import the promise-based MySQL pool

// Get all flights
router.get('/', async (req, res) => {
  try {
    const [flights] = await pool.query('SELECT * FROM flights');
    res.json(flights);
  } catch (err) {
    console.error('Error during fetching flights:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// Add a new flight
router.post('/', async (req, res) => {
  const { flight_number, departure_day, seat_limit, status } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO flights (flight_number, departure_day, seat_limit, status) VALUES (?, ?, ?, ?)',
      [flight_number, departure_day, seat_limit, status]
    );
    res.status(201).json({ message: 'Flight added successfully', id: result.insertId });
  } catch (err) {
    console.error('Error during adding flight:', err);
    res.status(500).json({ error: 'Failed to add flight' });
  }
});

// Update a flight
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { flight_number, departure_day, seat_limit, status } = req.body;
  try {
    await pool.query(
      'UPDATE flights SET flight_number = ?, departure_day = ?, seat_limit = ?, status = ? WHERE id = ?',
      [flight_number, departure_day, seat_limit, status, id]
    );
    res.json({ message: 'Flight updated successfully' });
  } catch (err) {
    console.error('Error during updating flight:', err);
    res.status(500).json({ error: 'Failed to update flight' });
  }
});

// Delete a flight
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