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
router.post('/refunds/process/:refundId', cancellationController.processRefund);

module.exports = router;