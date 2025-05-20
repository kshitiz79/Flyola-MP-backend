// routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');
const { authenticate } = require('../middleware/auth');

// Public
router.get('/irctc-bookings', bookingController.getIrctcBookings);
router.get('/generate-pnr', bookingController.generatePNR);
router.post('/complete-booking', bookingController.completeBooking);

// All others require a valid JWT


router.get('/summary',          bookingController.getBookingSummary);
router.get('/',                 bookingController.getBookings);
router.get('/:id(\\d+)',        bookingController.getBookingById);
router.post('/',                bookingController.createBooking);
router.put('/:id(\\d+)',        bookingController.updateBooking);
router.delete('/:id(\\d+)',     bookingController.deleteBooking);

// ✔️ now protected

router.post('/book-seats-irctc', bookingController.bookSeatsWithoutPayment);
router.get('/my',                bookingController.getUserBookings);

module.exports = router;




