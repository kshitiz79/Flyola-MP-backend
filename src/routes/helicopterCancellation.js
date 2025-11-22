const express = require('express');
const router = express.Router();
const helicopterCancellationController = require('../controller/helicopterCancellationController');
const { authenticate } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/details/:bookingId', helicopterCancellationController.getCancellationDetails);

// Protected routes (authentication required)
router.use(authenticate());

router.post('/cancel/:bookingId', helicopterCancellationController.cancelBooking);

// Admin routes
router.post('/admin-cancel/:bookingId', helicopterCancellationController.adminCancelBooking);

module.exports = router;
