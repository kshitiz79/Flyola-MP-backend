const getModels = () => require('../model');
const { razorpay } = require('../utils/razorpay');

// Utility function to create a payment
const createPaymentUtil = async (paymentData, transaction) => {
  const models = getModels();
  try {
    const newPayment = await models.Payment.create(paymentData, { transaction });
    return newPayment;
  } catch (err) {
    throw new Error('Failed to create payment: ' + err.message);
  }
};

// Create Razorpay order
const createOrder = async (req, res) => {
  const { amount } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });
    res.json({ order_id: order.id });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};

// Get all payments
const getPayments = async (req, res) => {
  const models = getModels();
  try {
    const payments = await models.Payment.findAll({
      include: [{ model: models.Booking }],
    });
    res.json(payments);
  } catch (err) {
    console.error('Error fetching payments:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get a payment by ID
const getPaymentById = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const payment = await models.Payment.findByPk(id, {
      include: [{ model: models.Booking }],
    });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (err) {
    console.error('Error fetching payment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a payment (standalone endpoint)
const createPayment = async (req, res) => {
  const { transaction_id, payment_id, payment_status, payment_mode, payment_amount, message, booking_id, user_id } = req.body;
  try {
    const newPayment = await createPaymentUtil({
      transaction_id,
      payment_id,
      payment_status,
      payment_mode,
      payment_amount,
      message,
      booking_id,
      user_id,
    });
    res.status(201).json(newPayment);
  } catch (err) {
    console.error('Error creating payment:', err);
    res.status(500).json({ error: err.message });
  }
};

// Update a payment
const updatePayment = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  const { transaction_id, payment_id, payment_status, payment_mode, payment_amount, message, booking_id, user_id } = req.body;
  try {
    const payment = await models.Payment.findByPk(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    await payment.update({
      transaction_id,
      payment_id,
      payment_status,
      payment_mode,
      payment_amount,
      message,
      booking_id,
      user_id,
    });
    res.json({ message: 'Payment updated successfully' });
  } catch (err) {
    console.error('Error updating payment:', err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
};

// Delete a payment
const deletePayment = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const payment = await models.Payment.findByPk(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    await payment.destroy();
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('Error deleting payment:', err);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
};

module.exports = {
  createOrder,
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  createPaymentUtil,
};