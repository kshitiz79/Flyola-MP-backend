const express = require('express');
const router = express.Router();
const helicopterCancellationController = require('../controller/helicopterCancellationController');
const { authenticate } = require('../middleware/auth');

// Public routes (no authentication required)
router.get('/details/:bookingId', helicopterCancellationController.getCancellationDetails);

// Protected routes (authentication required)
router.use(authenticate());

router.post('/cancel/:bookingId', helicopterCancellationController.cancelBooking);
router.get('/refunds', helicopterCancellationController.getUserHelicopterRefunds);

// Admin routes
router.post('/admin-cancel/:bookingId', helicopterCancellationController.adminCancelBooking);
router.get('/admin/refunds', helicopterCancellationController.getAllHelicopterRefunds);

module.exports = router;
