const getModels = () => require('../model');
const { razorpay, verifyPayment } = require('../utils/razorpay');
const { createPaymentUtil } = require('./paymentController');

const createJoyrideOrder = async (req, res) => {
  const { amount, payment_mode = 'RAZORPAY' } = req.body;
  if (amount == null) {
    return res.status(400).json({ error: 'Missing required field: amount' });
  }
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount. Must be a positive number.' });
  }

  try {
    let order;
    try {
      if (payment_mode === 'RAZORPAY_QR') {
        order = await razorpay.qr_codes.create({
          type: 'upi_qr',
          name: 'Flyola Aviation Joyride QR Payment',
          usage: 'single_use',
          fixed_amount: true,
          amount: numericAmount * 100,
          currency: 'INR',
          description: 'Joyride booking payment via QR code',
        });
      } else {
        order = await razorpay.orders.create({
          amount: numericAmount * 100,
          currency: 'INR',
          receipt: `joyride_receipt_${Date.now()}`,
        });
      }
    } catch (sdkErr) {
      return res.status(502).json({ error: sdkErr.message || 'Razorpay order creation failed' });
    }

    return res.json({
      order_id: order.id,
      payment_mode,
      ...(payment_mode === 'RAZORPAY_QR' && { qr_code: order.qr_code }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const verifyJoyridePayment = async (req, res) => {
  const { order_id, payment_id, signature, booking_id, user_id } = req.body;

  if (!order_id || !payment_id || !signature || !booking_id || !user_id) {
    return res.status(400).json({ error: 'Missing required fields: order_id, payment_id, signature, booking_id, user_id' });
  }

  try {
    const isValid = verifyPayment({ order_id, payment_id, signature });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const paymentData = {
      transaction_id: order_id,
      payment_id,
      payment_status: 'SUCCESS',
      payment_mode: 'RAZORPAY',
      payment_amount: req.body.payment_amount,
      message: 'Payment verified successfully',
      booking_id,
      user_id,
    };

    const newPayment = await createPaymentUtil(paymentData);
    res.status(201).json({
      message: 'Payment verified and recorded successfully',
      payment: newPayment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to verify payment' });
  }
};

const getJoyridePayments = async (req, res) => {
  try {
    const payments = await getModels().Payment.findAll({
      where: { booking_id: getModels().sequelize.col('JoyRideBooking.id') },
      include: [{ model: getModels().JoyRideBooking, as: 'JoyRideBooking' }],
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

const getJoyridePaymentById = async (req, res) => {
  const { id } = req.params;
  try {
    const payment = await getModels().Payment.findByPk(id, {
      include: [{ model: getModels().JoyRideBooking, as: 'JoyRideBooking' }],
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

module.exports = {
  createJoyrideOrder,
  verifyJoyridePayment,
  getJoyridePayments,
  getJoyridePaymentById,
};