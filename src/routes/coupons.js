const express = require('express');
const router = express.Router();
const couponController = require('../controller/couponController');


// Public routes
router.post('/validate', couponController.validateCoupon);
router.get('/auto-apply', couponController.getAutoApplyCoupons);

// Admin routes - require authentication and admin role
router.post('/', couponController.createCoupon);
router.get('/', couponController.getAllCoupons);
router.put('/:id', couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);
router.get('/usage/:couponId?', couponController.getCouponUsage);

module.exports = router;
