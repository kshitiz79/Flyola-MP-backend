const express = require('express');
const router = express.Router();
const { getAllPassengers, createPassenger , getHelicopterPassengers } = require('./../controller/passengerController');

router.get('/', getAllPassengers);
router.post('/', createPassenger);
router.get('/helicopter-bookings/:bookingId/passengers', getHelicopterPassengers);

module.exports = router;