const express = require('express');
const router = express.Router();
const reschedulingController = require('../controller/reschedulingController');
const { authenticate } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/details/:bookingId', reschedulingController.getReschedulingDetails);

// Protected routes (authentication required)
router.use(authenticate());

// Reschedule flight booking (for free/downgrade rescheduling)
router.post('/flight/:bookingId', reschedulingController.rescheduleFlightBooking);

// Reschedule helicopter booking (for free/downgrade rescheduling)
router.post('/helicopter/:bookingId', reschedulingController.rescheduleHelicopterBooking);

// Create payment order for rescheduling
router.post('/create-order/:bookingId', reschedulingController.createReschedulingOrder);

// Verify payment and complete rescheduling
router.post('/verify-payment/:bookingId', reschedulingController.verifyReschedulingPayment);

// Get user's rescheduling history
router.get('/history', reschedulingController.getUserReschedulingHistory);

// Admin reschedule - no payment required (admin only)
router.post('/admin/:bookingId', reschedulingController.adminRescheduleBooking);

module.exports = router;
