const express = require('express');
const router = express.Router();
const bookedSeatController = require('./../controller/bookedSeatController');

router.get('/', bookedSeatController.getBookedSeats);
router.get('/:id', bookedSeatController.getBookedSeatById);
router.post('/', bookedSeatController.createBookedSeat);
router.put('/:id', bookedSeatController.updateBookedSeat);
router.delete('/:id', bookedSeatController.deleteBookedSeat);

module.exports = router;