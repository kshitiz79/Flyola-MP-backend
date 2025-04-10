// routes/airport.js
const express = require('express');
const router = express.Router();
const airportController = require('./../controller/airportController');

// GET /airport - Retrieve all airports
router.get('/', airportController.getAirports);

// POST /airport - Add a new airport
router.post('/', airportController.addAirport);

// PUT /airport/:id - Update airport details
router.put('/:id', airportController.updateAirport);

// DELETE /airport/:id - Delete an airport
router.delete('/:id', airportController.deleteAirport);

module.exports = router;
