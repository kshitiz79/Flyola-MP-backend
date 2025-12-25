const express = require('express');
const router = express.Router();
const flightController = require('./../controller/flightController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes (no authentication required)
router.get('/', flightController.getFlights);

// Admin routes (authentication required)
router.post('/', authenticate([1]), adminActivityLoggers.createFlight, flightController.addFlight);
router.put('/:id', authenticate([1]), adminActivityLoggers.updateFlight, flightController.updateFlight);
router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteFlight, flightController.deleteFlight);

// Bulk operations (admin only)
router.put('/activate-all', authenticate([1]), adminActivityLoggers.updateFlight, flightController.activateAllFlights);
router.put('/edit-all', authenticate([1]), adminActivityLoggers.updateFlight, flightController.editAllFlights);
router.delete('/delete-all', authenticate([1]), adminActivityLoggers.deleteFlight, flightController.deleteAllFlights);




module.exports = router;