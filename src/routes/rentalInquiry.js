const express = require('express');
const router = express.Router();
const { sendRentalInquiry } = require('../controller/rentalInquiryController');

// POST /api/rental-inquiry - Send rental inquiry email
router.post('/', sendRentalInquiry);

module.exports = router;
