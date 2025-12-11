const express = require('express');
const router = express.Router();

// GET / - Home route
router.get('/', (req, res) => {
  res.json({ message: "Welcome to the backend API!" });
});

// Mount rental inquiry routes
router.use('/rental-inquiry', require('./rentalInquiry'));

// Mount logs routes
router.use('/logs', require('./logs'));

module.exports = router;
