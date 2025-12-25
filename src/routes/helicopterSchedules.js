const router = require('express').Router();
const ctrl = require('../controller/helicopterScheduleController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes (no authentication required)
router.get('/schedule-by-helipad', ctrl.getScheduleBetweenHelipadDate);
router.get('/price-by-da/:id', ctrl.getSchedulePriceByDay);
router.get('/', ctrl.getHelicopterSchedules);

// Admin routes (authentication required)
router.post('/', authenticate([1]), adminActivityLoggers.createHelicopterSchedule, ctrl.addHelicopterSchedule);
router.put('/:id', authenticate([1]), adminActivityLoggers.updateHelicopterSchedule, ctrl.updateHelicopterSchedule);
router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteHelicopterSchedule, ctrl.deleteHelicopterSchedule);

module.exports = router;