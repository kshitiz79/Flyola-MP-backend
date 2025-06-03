const express = require('express');
const router = express.Router();
const { bookSeat, getAvailableSeatLabels } = require('../controller/seatController');
const { holdSeats } = require('../controller/seatHoldController');
router.post('/book-seat', bookSeat);
router.get('/available-seats', getAvailableSeatLabels);
router.post('/hold-seats', holdSeats);

module.exports = router;