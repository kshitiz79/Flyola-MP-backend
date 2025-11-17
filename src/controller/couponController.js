const models = require('../model');
const Coupon = require('../model/coupon');
const CouponUsage = require('../model/couponUsage');
const { Op } = require('sequelize');

// Validate and apply coupon
async function validateCoupon(req, res) {
  try {
    const { code, bookingAmount, userId } = req.body;

    if (!code || !bookingAmount) {
      return res.status(400).json({ error: 'Coupon code and booking amount are required' });
    }

    const coupon = await Coupon.findOne({
      where: {
        code: code.toUpperCase(),
        status: 'active',
        valid_from: { [Op.lte]: new Date() },
        valid_until: { [Op.gte]: new Date() }
      }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return res.status(400).json({ error: 'Coupon usage limit exceeded' });
    }

    // Check minimum booking amount
    if (bookingAmount < coupon.min_booking_amount) {
      return res.status(400).json({ 
        error: `Minimum booking amount of ₹${coupon.min_booking_amount} required` 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (bookingAmount * coupon.discount_value) / 100;
      if (coupon.max_discount && discountAmount > coupon.max_discount) {
        discountAmount = coupon.max_discount;
      }
    } else {
      discountAmount = coupon.discount_value;
    }

    const finalAmount = Math.max(0, bookingAmount - discountAmount);

    return res.status(200).json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value
      },
      originalAmount: bookingAmount,
      discountAmount: discountAmount.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
      savings: discountAmount.toFixed(2)
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    return res.status(500).json({ error: 'Failed to validate coupon' });
  }
}

// Create coupon (Admin only)
async function createCoupon(req, res) {
  try {
    const {
      code,
      discount_type,
      discount_value,
      max_discount,
      min_booking_amount,
      usage_limit,
      valid_from,
      valid_until,
      description
    } = req.body;

    if (!code || !discount_type || !discount_value || !valid_until) {
      return res.status(400).json({ 
        error: 'Required fields: code, discount_type, discount_value, valid_until' 
      });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discount_type,
      discount_value,
      max_discount,
      min_booking_amount: min_booking_amount || 0,
      usage_limit,
      valid_from: valid_from || new Date(),
      valid_until,
      description,
      created_by: req.user?.id,
      status: 'active'
    });

    return res.status(201).json({
      message: 'Coupon created successfully',
      coupon
    });

  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }
    console.error('Create coupon error:', error);
    return res.status(500).json({ error: 'Failed to create coupon' });
  }
}

// Get all coupons (Admin)
async function getAllCoupons(req, res) {
  try {
    const coupons = await Coupon.findAll({
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({ coupons });
  } catch (error) {
    console.error('Get coupons error:', error);
    return res.status(500).json({ error: 'Failed to fetch coupons' });
  }
}

// Update coupon (Admin)
async function updateCoupon(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    await coupon.update(updates);

    return res.status(200).json({
      message: 'Coupon updated successfully',
      coupon
    });

  } catch (error) {
    console.error('Update coupon error:', error);
    return res.status(500).json({ error: 'Failed to update coupon' });
  }
}

// Delete coupon (Admin)
async function deleteCoupon(req, res) {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    await coupon.destroy();

    return res.status(200).json({ message: 'Coupon deleted successfully' });

  } catch (error) {
    console.error('Delete coupon error:', error);
    return res.status(500).json({ error: 'Failed to delete coupon' });
  }
}

// Get coupon usage history
async function getCouponUsage(req, res) {
  try {
    const { couponId } = req.params;

    const usage = await CouponUsage.findAll({
      where: couponId ? { coupon_id: couponId } : {},
      include: [
        {
          model: Coupon,
          as: 'coupon',
          attributes: ['code', 'discount_type', 'discount_value']
        }
      ],
      order: [['used_at', 'DESC']]
    });

    return res.status(200).json({ usage });
  } catch (error) {
    console.error('Get coupon usage error:', error);
    return res.status(500).json({ error: 'Failed to fetch coupon usage' });
  }
}

module.exports = {
  validateCoupon,
  createCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
  getCouponUsage
};
