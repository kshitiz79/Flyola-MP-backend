const express = require('express');
const router = express.Router();
const couponController = require('../controller/couponController');


// Public route - validate coupon
router.post('/validate', couponController.validateCoupon);

// Admin routes - require authentication and admin role


router.post('/', couponController.createCoupon);
router.get('/', couponController.getAllCoupons);
router.put('/:id', couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);
router.get('/usage/:couponId?', couponController.getCouponUsage);

module.exports = router;
