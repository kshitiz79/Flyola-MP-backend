// Test script to verify WINTER5 coupon
const Coupon = require('./src/model/coupon');
const { Op } = require('sequelize');

async function testCoupon() {
  try {
    console.log('Testing WINTER5 coupon...\n');
    
    // Find the coupon without date restrictions
    const couponAny = await Coupon.findOne({
      where: {
        code: 'WINTER5'
      }
    });
    
    console.log('Coupon found (no date filter):', couponAny ? 'YES' : 'NO');
    if (couponAny) {
      console.log('Coupon details:', JSON.stringify(couponAny.toJSON(), null, 2));
    }
    
    // Find with date restrictions (like the actual validation)
    const couponWithDates = await Coupon.findOne({
      where: {
        code: 'WINTER5',
        status: 'active',
        valid_from: { [Op.lte]: new Date() },
        valid_until: { [Op.gte]: new Date() }
      }
    });
    
    console.log('\nCoupon found (with date filter):', couponWithDates ? 'YES' : 'NO');
    console.log('Current date:', new Date());
    
    if (couponWithDates) {
      console.log('\nCoupon is valid!');
      
      // Test discount calculation
      const bookingAmount = 30000;
      let discountAmount = 0;
      
      if (couponWithDates.discount_type === 'percentage') {
        discountAmount = (bookingAmount * couponWithDates.discount_value) / 100;
        if (couponWithDates.max_discount && discountAmount > couponWithDates.max_discount) {
          console.log(`\nDiscount calculated: ₹${discountAmount}`);
          console.log(`Max discount cap: ₹${couponWithDates.max_discount}`);
          discountAmount = couponWithDates.max_discount;
          console.log(`Discount after cap: ₹${discountAmount}`);
        } else {
          console.log(`\nDiscount calculated: ₹${discountAmount} (no cap applied)`);
        }
      }
      
      const finalAmount = bookingAmount - discountAmount;
      console.log(`\nBooking amount: ₹${bookingAmount}`);
      console.log(`Discount: ₹${discountAmount}`);
      console.log(`Final amount: ₹${finalAmount}`);
    } else {
      console.log('\nCoupon is NOT valid (check dates or status)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testCoupon();
