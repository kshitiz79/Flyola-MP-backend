const router = require('express').Router();
const ctrl = require('../controller/scheduleExceptionController');

// Create or update exception
router.post('/', ctrl.createScheduleException);

// Quick cancel a specific date
router.post('/cancel-date', ctrl.cancelScheduleDate);

// Get exception for specific date
router.get('/by-date', ctrl.getExceptionByDate);

// Get all exceptions for a schedule
router.get('/schedule/:schedule_id', ctrl.getScheduleExceptions);

// Delete exception (restore to normal)
router.delete('/:id', ctrl.deleteScheduleException);

module.exports = router;
