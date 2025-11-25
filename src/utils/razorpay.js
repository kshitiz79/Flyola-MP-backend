const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Verify that the signature sent by Razorpay matches
 * the HMAC of order_id|payment_id using your key secret.
 */
function verifyPayment({ order_id, payment_id, signature }) {
  const payload = `${order_id}|${payment_id}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest("hex");

  return expected === signature;
}

/**
 * Process refund through Razorpay
 * @param {string} paymentId - Razorpay payment ID (e.g., pay_xxxxx)
 * @param {number} amount - Refund amount in INR (will be converted to paise)
 * @param {string} speed - Refund speed: 'normal' or 'optimum' (default: 'normal')
 * @returns {Promise<Object>} Razorpay refund object
 */
async function processRefund({ paymentId, amount, speed = 'normal', notes = {} }) {
  try {
    if (!paymentId) {
      throw new Error('Payment ID is required for refund');
    }

    if (!amount || amount <= 0) {
      throw new Error('Refund amount must be greater than 0');
    }

    // Convert amount to paise (Razorpay uses smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    console.log(`🔄 Processing Razorpay refund: Payment ID: ${paymentId}, Amount: ₹${amount}`);

    // Call Razorpay refund API
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amountInPaise,
      speed: speed, // 'normal' (5-7 days) or 'optimum' (instant if supported)
      notes: notes,
      receipt: `refund_${Date.now()}`
    });

    console.log(`✅ Razorpay refund successful: Refund ID: ${refund.id}, Status: ${refund.status}`);

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100, // Convert back to INR
      status: refund.status,
      speed: refund.speed_processed,
      createdAt: refund.created_at
    };

  } catch (error) {
    console.error('❌ Razorpay refund failed:', error.message);
    
    // Handle specific Razorpay errors
    if (error.error) {
      const razorpayError = error.error;
      throw new Error(`Razorpay Error: ${razorpayError.description || razorpayError.reason || error.message}`);
    }
    
    throw new Error(`Refund processing failed: ${error.message}`);
  }
}

/**
 * Fetch refund status from Razorpay
 * @param {string} refundId - Razorpay refund ID
 * @returns {Promise<Object>} Refund details
 */
async function getRefundStatus(refundId) {
  try {
    const refund = await razorpay.refunds.fetch(refundId);
    
    return {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount / 100,
      status: refund.status,
      speedProcessed: refund.speed_processed,
      createdAt: refund.created_at
    };
  } catch (error) {
    console.error('❌ Failed to fetch refund status:', error.message);
    throw new Error(`Failed to fetch refund status: ${error.message}`);
  }
}

/**
 * Get all refunds for a payment
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Array>} List of refunds
 */
async function getPaymentRefunds(paymentId) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    const refunds = payment.refunds || [];
    
    return refunds.map(refund => ({
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status,
      createdAt: refund.created_at
    }));
  } catch (error) {
    console.error('❌ Failed to fetch payment refunds:', error.message);
    throw new Error(`Failed to fetch payment refunds: ${error.message}`);
  }
}

module.exports = { 
  razorpay, 
  verifyPayment,
  processRefund,
  getRefundStatus,
  getPaymentRefunds
};