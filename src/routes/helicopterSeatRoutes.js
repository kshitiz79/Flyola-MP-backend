const express = require('express');
const router = express.Router();
const { bookHelicopterSeat, getAvailableHelicopterSeatLabels } = require('../controller/helicopterSeatController');

router.post('/book-seat', bookHelicopterSeat);
router.get('/available-seats', getAvailableHelicopterSeatLabels);

module.exports = router;