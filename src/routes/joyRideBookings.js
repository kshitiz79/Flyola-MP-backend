const express = require('express');
const router = express.Router();
const controller = require('../controller/joyRideBookingController');

// Payment routes
router.post('/create-order', controller.createOrder);
router.post('/verify-payment', controller.verifyPayment);

// Booking routes
router.get('/', controller.getAllBookings);
router.get('/:id', controller.getBookingById);
router.put('/:id', controller.updateBookingStatus);
router.delete('/:id', controller.cancelBooking);

module.exports = router;
