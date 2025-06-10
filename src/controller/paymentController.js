
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
  const { amount, payment_mode = 'RAZORPAY' } = req.body;

  // Validate amount
  if (amount == null) {
    return res.status(400).json({ error: 'Missing required field: amount' });
  }
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount. Must be a positive number.' });
  }

  try {
    let order;
    if (payment_mode === 'RAZORPAY_QR') {
      order = await razorpay.qr_codes.create({
        type: 'upi_qr',
        name: 'Flyola Aviation QR Payment',
        usage: 'single_use',
        fixed_amount: true,
        amount: Math.round(numericAmount * 100), // Ensure integer paise
        currency: 'INR',
        description: 'Flight booking payment via QR code',
      });
    } else {
      order = await razorpay.orders.create({
        amount: Math.round(numericAmount * 100), // Convert to paise
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
      });
    }

    return res.status(201).json({
      order_id: order.id,
      payment_mode,
      ...(payment_mode === 'RAZORPAY_QR' && { qr_code: order.qr_code }),
    });
  } catch (err) {
    console.error('[createOrder] Error:', err);
    return res.status(500).json({ error: `Failed to create order: ${err.message}` });
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
