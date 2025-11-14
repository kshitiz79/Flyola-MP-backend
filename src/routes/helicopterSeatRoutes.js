const express = require('express');
const router = express.Router();
const { bookHelicopterSeat, getAvailableHelicopterSeatLabels } = require('../controller/helicopterSeatController');
const { holdHelicopterSeats } = require('../controller/helicopterSeatHoldController');

router.post('/book-seat', bookHelicopterSeat);
router.get('/available-seats', getAvailableHelicopterSeatLabels);
router.post('/hold-seats', holdHelicopterSeats);

module.exports = router;