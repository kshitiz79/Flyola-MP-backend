const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');
const { authenticate } = require('../middleware/auth');

// Booking routes
router.get('/irctc-bookings',  bookingController.getIrctcBookings);
router.get('/summary', authenticate(), bookingController.getBookingSummary);
router.get('/', authenticate(), bookingController.getBookings);
router.get('/:id(\\d+)', authenticate(), bookingController.getBookingById);
router.post('/', authenticate(), bookingController.createBooking);
router.put('/:id(\\d+)', authenticate(), bookingController.updateBooking);
router.delete('/:id(\\d+)', authenticate(), bookingController.deleteBooking);
router.post('/complete-booking', authenticate(), bookingController.completeBooking);
router.post('/book-seats-irctc',  bookingController.bookSeatsWithoutPayment);
router.get('/generate-pnr',  bookingController.generatePNR);
router.get('/my', authenticate(), bookingController.getUserBookings);

module.exports = router;








