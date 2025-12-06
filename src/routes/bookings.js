// routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');
const passengerController = require('../controller/passengerController');
const { authenticate } = require('../middleware/auth');

// Stats endpoints (public for operations dashboard)
router.get('/stats', bookingController.getBookingStats);
router.get('/stats/dashboard', bookingController.getBookingStatsMultiple);

router.get('/pnr', bookingController.getBookingByPnr);
router.get('/by-user', bookingController.getBookingsByUser);
router.get('/irctc-bookings', bookingController.getIrctcBookings);
router.get('/generate-pnr', bookingController.generatePNR);
router.post('/book-seats', bookingController.bookSeatsWithoutPayment);
router.post('/book-helicopter-seats', bookingController.bookHelicopterSeatsWithoutPayment);
router.post('/irctc/cancel/:id(\\d+)', bookingController.cancelIrctcBooking);
router.post('/irctc/reschedule/:id(\\d+)', bookingController.rescheduleIrctcBooking);
router.post('/helicopter/cancel/:id(\\d+)', bookingController.cancelHelicopterBooking);
router.post('/helicopter/reschedule/:id(\\d+)', bookingController.rescheduleHelicopterBooking);
router.get('/helicopter-bookings', bookingController.getHelicopterBookings);
router.get('/helicopter-bookings/:bookingId/passengers', passengerController.getHelicopterPassengers);
router.get('/', bookingController.getBookings);

router.use(authenticate());

router.post('/complete-booking', bookingController.completeBooking);
router.post('/complete-booking-discount', bookingController.completeBookingWithDiscount);
router.get('/summary', bookingController.getBookingSummary);
router.get('/my', bookingController.getUserBookings);
router.get('/:id(\\d+)', bookingController.getBookingById);
router.post('/', bookingController.createBooking);
router.put('/:id(\\d+)', bookingController.updateBooking);
router.delete('/:id(\\d+)', bookingController.deleteBooking);

module.exports = router;


