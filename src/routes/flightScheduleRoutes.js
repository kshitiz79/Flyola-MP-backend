const router = require('express').Router();
const ctrl = require('../controller/flightScheduleController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes (no authentication required)
router.get('/schedule-by-airport', ctrl.getScheduleBetweenAirportDate);
router.get('/price-by-da/:id', ctrl.getSchedulePriceByDay);
router.get('/', ctrl.getFlightSchedules);
router.get('/:id', ctrl.getFlightScheduleById);

// Admin routes (authentication required)
router.post('/activate-all', authenticate([1]), adminActivityLoggers.activateAllSchedules, ctrl.activateAllFlightSchedules);
router.post('/edit-all', authenticate([1]), adminActivityLoggers.updateSchedule, ctrl.editAllFlightSchedules);
router.delete('/delete-all', authenticate([1]), adminActivityLoggers.deleteAllSchedules, ctrl.deleteAllFlightSchedules);
router.post('/update-flight-stops', authenticate([1]), adminActivityLoggers.updateSchedule, ctrl.updateFlightStops);
router.post('/', authenticate([1]), adminActivityLoggers.createSchedule, ctrl.addFlightSchedule);
router.put('/:id', authenticate([1]), adminActivityLoggers.updateSchedule, ctrl.updateFlightSchedule);
router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteSchedule, ctrl.deleteFlightSchedule);


module.exports = router;