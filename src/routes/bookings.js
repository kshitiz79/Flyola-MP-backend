// routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controller/bookingController');
const { authenticate } = require('../middleware/auth');


// Public
router.get('/pnr', bookingController.getBookingByPnr);
router.get('/irctc-bookings', bookingController.getIrctcBookings);
router.get('/generate-pnr', bookingController.generatePNR);
router.post('/complete-booking', bookingController.completeBooking);
router.post('/book-seats', bookingController.bookSeatsWithoutPayment); 
router.post('/irctc/cancel/:id(\\d+)', bookingController.cancelIrctcBooking); 
router.post('/irctc/reschedule/:id(\\d+)', bookingController.rescheduleIrctcBooking);



router.get('/', bookingController.getBookings);

router.use(authenticate());

router.get('/summary', bookingController.getBookingSummary);
router.get('/my', bookingController.getUserBookings);
router.get('/:id(\\d+)', bookingController.getBookingById);
router.post('/', bookingController.createBooking);
router.put('/:id(\\d+)', bookingController.updateBooking);
router.delete('/:id(\\d+)', bookingController.deleteBooking);



module.exports = router;




module.exports = router;




