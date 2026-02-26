const express = require('express');
const router = express.Router();
const cancellationController = require('../controller/cancellationController');
const { authenticate } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/details/:bookingId', cancellationController.getCancellationDetails);

// Protected routes (authentication required)
router.use(authenticate());

router.post('/cancel/:bookingId', cancellationController.cancelBooking);
router.get('/refunds', cancellationController.getUserRefunds);

// Admin routes (additional role check can be added)
router.get('/admin/refunds', cancellationController.getAllRefunds);
router.post('/refunds/process/:refundId', cancellationController.processRefund);
router.post('/admin-cancel/:bookingId', cancellationController.adminCancelBooking);

// Per-seat cancellation routes
router.post('/cancel-seats/:bookingId', cancellationController.cancelSeats);
router.post('/admin-cancel-seats/:bookingId', cancellationController.adminCancelSeats);

module.exports = router;