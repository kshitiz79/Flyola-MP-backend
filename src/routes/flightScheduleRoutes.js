const router = require('express').Router();
const ctrl = require('../controller/flightScheduleController');

router.post('/activate-all', ctrl.activateAllFlightSchedules);
router.post('/edit-all', ctrl.editAllFlightSchedules);
router.delete('/delete-all', ctrl.deleteAllFlightSchedules);
router.post('/update-flight-stops', ctrl.updateFlightStops);

// Specific routes MUST come before parameterized routes
router.get('/schedule-by-airport', ctrl.getScheduleBetweenAirportDate);
router.get('/price-by-da/:id', ctrl.getSchedulePriceByDay);

// General CRUD routes
router.get('/', ctrl.getFlightSchedules);
router.get('/:id', ctrl.getFlightScheduleById);
router.post('/', ctrl.addFlightSchedule);
router.put('/:id', ctrl.updateFlightSchedule);
router.delete('/:id', ctrl.deleteFlightSchedule);


module.exports = router;