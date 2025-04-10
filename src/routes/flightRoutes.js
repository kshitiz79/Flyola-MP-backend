const express = require('express');
const router = express.Router();
const flightController = require('./../controller/flightController');

// Get all flights
router.get('/', flightController.getFlights);

// Add a new flight
router.post('/', flightController.addFlight);

// Update a flight
router.put('/:id', flightController.updateFlight);

// Delete a flight
router.delete('/:id', flightController.deleteFlight);

// Bulk operations
router.put('/activate-all', flightController.activateAllFlights);
router.put('/edit-all', flightController.editAllFlights);
router.delete('/delete-all', flightController.deleteAllFlights);

module.exports = router;