const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');

// Existing booking routes (if any)
router.get('/', bookingController.getBookings); // Example
router.get('/:id', bookingController.getBookingById); // Example
router.post('/', bookingController.createBooking); // Example
router.put('/:id', bookingController.updateBooking); // Example
router.delete('/:id', bookingController.deleteBooking); // Example

// Add complete-booking route
router.post('/complete-booking', bookingController.completeBooking);

module.exports = router;