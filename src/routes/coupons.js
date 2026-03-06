const express = require('express');
const router = express.Router();
const couponController = require('../controller/couponController');
const couponStatsController = require('../controller/couponStatsController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes
router.post('/validate', couponController.validateCoupon);
router.get('/auto-apply', couponController.getAutoApplyCoupons);

// Public routes (previously admin)
router.post('/', adminActivityLoggers.createCoupon, couponController.createCoupon);
router.get('/', couponController.getAllCoupons);
router.put('/:id', adminActivityLoggers.updateCoupon, couponController.updateCoupon);
router.delete('/:id', adminActivityLoggers.deleteCoupon, couponController.deleteCoupon);
router.get('/usage/:couponId?', couponController.getCouponUsage);

// Statistics routes
router.get('/stats/usage', couponStatsController.getCouponUsageStats);
router.get('/stats/detailed/:couponId', couponStatsController.getCouponDetailedUsage);

module.exports = router;
