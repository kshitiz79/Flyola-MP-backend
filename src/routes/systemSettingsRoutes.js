const express = require('express');
const router = express.Router();
const {
  getBookingCutoffTime,
  updateBookingCutoffTime,
  getAllSettings
} = require('../controller/systemSettingsController');

// Public endpoint - no auth required
router.get('/booking-cutoff-time', getBookingCutoffTime);

// Admin only endpoints
router.put('/booking-cutoff-time', updateBookingCutoffTime);
router.get('/all', getAllSettings);

module.exports = router;
