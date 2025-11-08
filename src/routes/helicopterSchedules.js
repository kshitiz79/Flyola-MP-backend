const router = require('express').Router();
const ctrl = require('../controller/helicopterScheduleController');

router.get('/', ctrl.getHelicopterSchedules);
router.post('/', ctrl.addHelicopterSchedule);
router.put('/:id', ctrl.updateHelicopterSchedule);
router.delete('/:id', ctrl.deleteHelicopterSchedule);

router.get('/price-by-day/:id', ctrl.getSchedulePriceByDay);
router.get('/schedule-by-helipad', ctrl.getScheduleBetweenHelipadDate);

module.exports = router;