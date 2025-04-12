
const express = require('express');
const router = express.Router();

// Instead of ./../users/users.js, require ../db
const db = require('./../../db'); 

// GET /users - Retrieve all users as JSON
router.get('/', (req, res) => {
  db.query('SELECT * FROM reviews')
    .then(([results, fields]) => {
      res.json(results);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Database query failed' });
    });
});


module.exports = router;
