const express = require('express');
const router = express.Router();
const joyridePaymentController = require('./../controller/joyridePaymentController');
const joyrideBillingController = require('./../controller/joyrideBillingController');

router.post('/create-order', joyridePaymentController.createJoyrideOrder);
router.post('/verify', joyridePaymentController.verifyJoyridePayment);
router.get('/payments', joyridePaymentController.getJoyridePayments);
router.get('/payments/:id', joyridePaymentController.getJoyridePaymentById);
router.post('/billing', joyrideBillingController.createJoyrideBilling);
router.get('/billing', joyrideBillingController.getJoyrideBillings);
router.get('/billing/:id', joyrideBillingController.getJoyrideBillingById);

module.exports = router;