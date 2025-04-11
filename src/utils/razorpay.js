const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_DiMiYr3VpklxK8',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'yVDDF9cO2QWVdZ2DCqSIIbZq',
});

const verifyPayment = async (payment_id, order_id, signature) => {
  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'yVDDF9cO2QWVdZ2DCqSIIbZq')
    .update(`${order_id}|${payment_id}`)
    .digest('hex');
  return generatedSignature === signature;
};

module.exports = { razorpay, verifyPayment };