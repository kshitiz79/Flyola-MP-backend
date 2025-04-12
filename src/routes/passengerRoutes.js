const express = require('express');
const router = express.Router();
const { getAllPassengers, createPassenger } = require('./../controller/passengerController');

router.get('/', getAllPassengers);
router.post('/', createPassenger);

module.exports = router;