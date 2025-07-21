const express = require('express');
const router = express.Router();
const joyrideSlotController = require('../controller/joyrideController');
const JoyRideBookingController = require('../controller/JoyRideBookingController');
const joyridePaymentController = require('../controller/joyridePaymentController');
const { authenticate } = require('../middleware/auth'); // Adjust path to your middleware file

// Public routes (no authentication required)
router.get('/', joyrideSlotController.getJoyrideSlots);
router.get('/user-joyride-bookings', JoyRideBookingController.getUserJoyrideBookings);

// Protected routes (authentication and role-based access)
router.get('/joyride-bookings', JoyRideBookingController.getJoyrideBookings);
router.post('/joyride-bookings', authenticate([3]), JoyRideBookingController.createJoyrideBooking);
router.post('/create-order', authenticate([3]), joyridePaymentController.createJoyrideOrder);
router.post('/verify', authenticate([3]), joyridePaymentController.verifyJoyridePayment);
router.get('/payments', authenticate([1]), joyridePaymentController.getJoyridePayments);
router.get('/payments/:id', authenticate([1]), joyridePaymentController.getJoyridePaymentById);

// Admin-only routes (role 1)
router.post('/', authenticate([1]), joyrideSlotController.addJoyrideSlot);
router.put('/:id', authenticate([1]), joyrideSlotController.updateJoyrideSlot);
router.delete('/:id', authenticate([1]), joyrideSlotController.deleteJoyrideSlot);

module.exports = router;