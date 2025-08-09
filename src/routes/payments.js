const express = require('express');
const router = express.Router();
const paymentController = require('./../controller/paymentController');
const { authenticate } = require('../middleware/auth');

router.post('/create-order', paymentController.createOrder);
router.get('/', paymentController.getPayments);

// Protected routes
router.use(authenticate());
router.get('/user', paymentController.getUserPayments);

router.get('/:id', paymentController.getPaymentById);
router.post('/', paymentController.createPayment);
router.put('/:id', paymentController.updatePayment);
router.delete('/:id', paymentController.deletePayment);

module.exports = router;



