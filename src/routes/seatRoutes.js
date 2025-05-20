const express = require('express');
const router = express.Router();
const { bookSeat, getAvailableSeatLabels } = require('../controller/seatController');

router.post('/book-seat', bookSeat);
router.get('/available-seats', getAvailableSeatLabels);

module.exports = router;