const express = require('express');
const router = express.Router();
const aeroplaneController = require('../controller/aeroplaneController');
const { autoRestartMiddleware } = require('../middleware/autoRestartMiddleware');

// Apply auto-restart middleware to all routes
router.use(autoRestartMiddleware);

// ==================== AIRPORT ROUTES ====================
router.get('/airports', aeroplaneController.getAllAirports);
router.get('/airports/:id', aeroplaneController.getAirportById);
router.post('/airports', aeroplaneController.createAirport);
router.put('/airports/:id', aeroplaneController.updateAirport);
router.delete('/airports/:id', aeroplaneController.deleteAirport);

// ==================== FLIGHT ROUTES ====================
router.get('/flights', aeroplaneController.getAllFlights);
router.get('/flights/:id', aeroplaneController.getFlightById);
router.post('/flights', aeroplaneController.createFlight);
router.put('/flights/:id', aeroplaneController.updateFlight);
router.delete('/flights/:id', aeroplaneController.deleteFlight);

// ==================== HELICOPTER ROUTES ====================
router.get('/helicopters', aeroplaneController.getAllHelicopters);
router.get('/helicopters/:id', aeroplaneController.getHelicopterById);
router.post('/helicopters', aeroplaneController.createHelicopter);
router.put('/helicopters/:id', aeroplaneController.updateHelicopter);
router.delete('/helicopters/:id', aeroplaneController.deleteHelicopter);

// ==================== HELIPAD ROUTES ====================
router.get('/helipads', aeroplaneController.getAllHelipads);
router.get('/helipads/:id', aeroplaneController.getHelipadById);
router.post('/helipads', aeroplaneController.createHelipad);
router.put('/helipads/:id', aeroplaneController.updateHelipad);
router.delete('/helipads/:id', aeroplaneController.deleteHelipad);

// ==================== FLIGHT SCHEDULE ROUTES ====================
router.get('/flight-schedules', aeroplaneController.getAllFlightSchedules);
router.get('/flight-schedules/:id', aeroplaneController.getFlightScheduleById);
router.post('/flight-schedules', aeroplaneController.createFlightSchedule);
router.put('/flight-schedules/:id', aeroplaneController.updateFlightSchedule);
router.delete('/flight-schedules/:id', aeroplaneController.deleteFlightSchedule);

// ==================== HELICOPTER SCHEDULE ROUTES ====================
router.get('/helicopter-schedules', aeroplaneController.getAllHelicopterSchedules);
router.get('/helicopter-schedules/:id', aeroplaneController.getHelicopterScheduleById);
router.post('/helicopter-schedules', aeroplaneController.createHelicopterSchedule);
router.put('/helicopter-schedules/:id', aeroplaneController.updateHelicopterSchedule);
router.delete('/helicopter-schedules/:id', aeroplaneController.deleteHelicopterSchedule);

module.exports = router;
