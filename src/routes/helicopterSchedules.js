const router = require('express').Router();
const ctrl = require('../controller/helicopterScheduleController');

// Specific routes MUST come before parameterized routes
router.get('/schedule-by-helipad', ctrl.getScheduleBetweenHelipadDate);
router.get('/price-by-da/:id', ctrl.getSchedulePriceByDay);

// General CRUD routes
router.get('/', ctrl.getHelicopterSchedules);
router.post('/', ctrl.addHelicopterSchedule);
router.put('/:id', ctrl.updateHelicopterSchedule);
router.delete('/:id', ctrl.deleteHelicopterSchedule);

module.exports = router;