// src/routes/coupons.js
const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const RZP_KEY    = process.env.RAZORPAY_KEY_ID;
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET;

router.get('/', async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://api.razorpay.com/v1/coupons',
      {
        auth: { username: RZP_KEY, password: RZP_SECRET },
        // optional: params: { count: 50, skip: 0 }
      }
    );
    // data.items is an array of coupons
    res.json(data.items);
  } catch (err) {
    console.error('Error fetching coupons:', err.response?.data || err);
    res.status(500).json({ error: 'Unable to fetch coupons' });
  }
});

module.exports = router;
