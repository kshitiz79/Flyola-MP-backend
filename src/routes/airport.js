const express = require('express');
const router = express.Router();
const airportController = require('./../controller/airportController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes (no authentication required)
router.get('/', airportController.getAirports);

// Admin routes (authentication required)
router.post('/', authenticate([1]), adminActivityLoggers.createAirport, airportController.addAirport);
router.put('/:id', authenticate([1]), adminActivityLoggers.updateAirport, airportController.updateAirport);
router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteAirport, airportController.deleteAirport);

// Bulk operations (admin only)
router.put('/activate', authenticate([1]), adminActivityLoggers.updateAirport, airportController.activateAllAirports);
router.put('/edit', authenticate([1]), adminActivityLoggers.updateAirport, airportController.editAllAirports);
router.delete('/', authenticate([1]), adminActivityLoggers.deleteAirport, airportController.deleteAllAirports);

module.exports = router;