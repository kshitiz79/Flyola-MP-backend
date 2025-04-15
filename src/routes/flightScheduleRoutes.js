// src/routes/flightSchedules.js
const router = require('express').Router();
const ctrl = require('../controller/flightScheduleController');

router.get('/', ctrl.getFlightSchedules);
router.post('/', ctrl.addFlightSchedule);
router.put('/:id', ctrl.updateFlightSchedule);
router.delete('/:id', ctrl.deleteFlightSchedule);

// Bulk operations – adjust as needed
router.post('/activate-all', ctrl.activateAllFlightSchedules);
router.post('/edit-all', ctrl.editAllFlightSchedules);
router.delete('/delete-all', ctrl.deleteAllFlightSchedules);

module.exports = router;
