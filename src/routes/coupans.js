// src/routes/coupons.js
const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const RZP_KEY    = process.env.RAZORPAY_KEY_ID;
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET;

router.get('/', async (req, res) => {
  try {
    // Check if Razorpay credentials are available
    if (!RZP_KEY || !RZP_SECRET) {
      // Return mock coupons if credentials are not available
      return res.json([
        {
          id: 'coupon_1',
          code: 'SAVE10',
          description: 'Get 10% off on your booking',
          percent_off: 10,
          active: true
        },
        {
          id: 'coupon_2', 
          code: 'WELCOME20',
          description: 'Welcome offer - 20% off',
          percent_off: 20,
          active: true
        }
      ]);
    }

    // Razorpay doesn't have a public coupons API endpoint
    // Return mock coupons instead
    const mockCoupons = [
      {
        id: 'coupon_1',
        code: 'SAVE10',
        description: 'Get 10% off on your booking',
        percent_off: 10,
        active: true
      },
      {
        id: 'coupon_2',
        code: 'WELCOME20',
        description: 'Welcome offer - 20% off',
        percent_off: 20,
        active: true
      }
    ];
    
    return res.json(mockCoupons);
    
    // Return Razorpay coupons or fallback to mock data
    res.json(data.items || []);
  } catch (err) {
    console.error('Razorpay coupons API error:', err.message);
    
    // Return mock coupons as fallback
    res.json([
      {
        id: 'coupon_1',
        code: 'SAVE10',
        description: 'Get 10% off on your booking',
        percent_off: 10,
        active: true
      },
      {
        id: 'coupon_2',
        code: 'FIRSTFLIGHT',
        description: 'First flight discount - 15% off',
        percent_off: 15,
        active: true
      }
    ]);
  }
});

module.exports = router;
