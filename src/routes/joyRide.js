const express = require('express');
const router = express.Router();
const joyrideSlotController = require('./../controller/joyrideController');
const JoyRideBookingController = require('./../controller/JoyRideBookingController');

// GET /api/joyride-slots - Retrieve all joyride slots
router.get('/', joyrideSlotController.getJoyrideSlots);

// POST /api/joyride-slots - Add a new joyride slot
router.post('/', joyrideSlotController.addJoyrideSlot);

// PUT /api/joyride-slots/:id - Update joyride slot details
router.put('/:id', joyrideSlotController.updateJoyrideSlot);

// DELETE /api/joyride-slots/:id - Delete a joyride slot
router.delete('/:id', joyrideSlotController.deleteJoyrideSlot);

// GET /api/joyride-slots/joyride-bookings - Retrieve all joyride bookings
router.get('/joyride-bookings', JoyRideBookingController.getJoyrideBookings);

// POST /api/joyride-slots/joyride-bookings - Create a new joyride booking
router.post('/joyride-bookings', JoyRideBookingController.createJoyrideBooking);

module.exports = router;