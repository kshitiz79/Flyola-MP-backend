const router = require('express').Router();
const ctrl = require('../controller/flightScheduleController');

router.post('/activate-all', ctrl.activateAllFlightSchedules);
router.post('/edit-all', ctrl.editAllFlightSchedules);
router.delete('/delete-all', ctrl.deleteAllFlightSchedules);
router.post('/update-flight-stops', ctrl.updateFlightStops);

router.get('/', ctrl.getFlightSchedules);
router.post('/', ctrl.addFlightSchedule);
router.put('/:id', ctrl.updateFlightSchedule);
router.delete('/:id', ctrl.deleteFlightSchedule);

router.get('/price-by-day/:id', ctrl.getSchedulePriceByDay);


module.exports = router;