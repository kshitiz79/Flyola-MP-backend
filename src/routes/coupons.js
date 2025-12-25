const express = require('express');
const router = express.Router();
const couponController = require('../controller/couponController');
const couponStatsController = require('../controller/couponStatsController');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// Public routes
router.post('/validate', couponController.validateCoupon);
router.get('/auto-apply', couponController.getAutoApplyCoupons);

// Admin routes - require authentication and admin role
router.post('/', authenticate([1]), adminActivityLoggers.createCoupon, couponController.createCoupon);
router.get('/', authenticate([1]), couponController.getAllCoupons);
router.put('/:id', authenticate([1]), adminActivityLoggers.updateCoupon, couponController.updateCoupon);
router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteCoupon, couponController.deleteCoupon);
router.get('/usage/:couponId?', authenticate([1]), couponController.getCouponUsage);

// Statistics routes
router.get('/stats/usage', authenticate([1]), couponStatsController.getCouponUsageStats);
router.get('/stats/detailed/:couponId', authenticate([1]), couponStatsController.getCouponDetailedUsage);

module.exports = router;
