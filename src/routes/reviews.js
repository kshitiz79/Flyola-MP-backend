// routes/users.js
const express = require('express');
const router = express.Router();

// Instead of ./../users/users.js, require ../db
const db = require('./../../db'); 

// GET /users - Retrieve all users as JSON
router.get('/', (req, res) => {
  db.query('SELECT * FROM reviews', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(results);
  });
});

module.exports = router;
