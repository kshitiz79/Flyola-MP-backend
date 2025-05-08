
const getModels = () => require('../model');
const { razorpay } = require('../utils/razorpay');


const createPaymentUtil = async (paymentData, transaction) => {
  const models = getModels();
  try {
    return await models.Payment.create(paymentData, { transaction });
  } catch (err) {
    throw new Error('Failed to create payment: ' + err.message);
  }
};


const createOrder = async (req, res) => {
  const { amount } = req.body;
  if (amount == null) {
    return res.status(400).json({ error: "Missing required field: amount" });
  }
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount. Must be a positive number." });
  }

  try {
    let order;
    try {
      order = await razorpay.orders.create({
        amount: numericAmount * 100, 
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
      });
    } catch (sdkErr) {
      return res.status(502).json({ error: sdkErr.message || "Razorpay order creation failed" });
    }

    return res.json({ order_id: order.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
};


const getPayments = async (req, res) => {
  try {
    const payments = await getModels().Payment.findAll({
      include: [{ model: getModels().Booking }],
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};


const getPaymentById = async (req, res) => {
  const { id } = req.params;
  try {
    const payment = await getModels().Payment.findByPk(id, {
      include: [{ model: getModels().Booking }],
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};


const createPayment = async (req, res) => {
  const {
    transaction_id,
    payment_id,
    payment_status,
    payment_mode,
    payment_amount,
    message,
    booking_id,
    user_id,
  } = req.body;

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
    res.status(500).json({ error: err.message });
  }
};


const updatePayment = async (req, res) => {
  const { id } = req.params;
  const {
    transaction_id,
    payment_id,
    payment_status,
    payment_mode,
    payment_amount,
    message,
    booking_id,
    user_id,
  } = req.body;

  try {
    const payment = await getModels().Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

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
  } catch {
    res.status(500).json({ error: 'Failed to update payment' });
  }
};


const deletePayment = async (req, res) => {
  const { id } = req.params;
  try {
    const payment = await getModels().Payment.findByPk(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    await payment.destroy();
    res.json({ message: 'Payment deleted successfully' });
  } catch {
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
