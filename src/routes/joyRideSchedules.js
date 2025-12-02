const express = require('express');
const router = express.Router();
const joyRideScheduleController = require('../controller/joyRideScheduleController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/', joyRideScheduleController.getJoyRideSchedules);

// Admin-only routes (role 1)
router.post('/', authenticate([1]), joyRideScheduleController.createJoyRideSchedule);
router.put('/:id', authenticate([1]), joyRideScheduleController.updateJoyRideSchedule);
router.delete('/:id', authenticate([1]), joyRideScheduleController.deleteJoyRideSchedule);

module.exports = router;
