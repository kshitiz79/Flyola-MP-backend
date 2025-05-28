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

module.exports = { razorpay, verifyPayment };