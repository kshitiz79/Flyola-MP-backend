const express = require('express');
const router = express.Router();
const flightScheduleController = require('./../controller/flightScheduleController');

// Get all flight schedules
router.get('/', flightScheduleController.getFlightSchedules);

// Add a new flight schedule
router.post('/', flightScheduleController.addFlightSchedule);

// Update a flight schedule
router.put('/:id', flightScheduleController.updateFlightSchedule);

// Delete a flight schedule
router.delete('/:id', flightScheduleController.deleteFlightSchedule);

// Bulk operations
router.put('/activate-all', flightScheduleController.activateAllFlightSchedules);
router.put('/edit-all', flightScheduleController.editAllFlightSchedules);
router.delete('/delete-all', flightScheduleController.deleteAllFlightSchedules);

module.exports = router;