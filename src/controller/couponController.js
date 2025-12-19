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
      discountAmount = (parseFloat(bookingAmount) * parseFloat(coupon.discount_value)) / 100;
      if (coupon.max_discount && discountAmount > parseFloat(coupon.max_discount)) {
        discountAmount = parseFloat(coupon.max_discount);
      }
    } else {
      discountAmount = parseFloat(coupon.discount_value);
    }

    const finalAmount = Math.max(0, parseFloat(bookingAmount) - discountAmount);

    return res.status(200).json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value
      },
      originalAmount: parseFloat(bookingAmount),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      finalAmount: parseFloat(finalAmount.toFixed(2)),
      savings: parseFloat(discountAmount.toFixed(2))
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    return res.status(500).json({ 
      error: 'Failed to validate coupon',
      details: error.message,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
      description,
      auto_apply
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
      auto_apply: auto_apply || false,
      created_by: req.user?.id,
      status: 'active'
    });

    // Return coupon without sensitive fields
    const couponJson = coupon.toJSON();
    delete couponJson.created_by;
    delete couponJson.created_at;
    delete couponJson.updated_at;

    return res.status(201).json({
      message: 'Coupon created successfully',
      coupon: couponJson
    });

  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors.map(e => ({ field: e.path, message: e.message }))
      });
    }
    console.error('Create coupon error:', error);
    return res.status(500).json({ 
      error: 'Failed to create coupon',
      details: error.message,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get all coupons (Admin)
async function getAllCoupons(req, res) {
  try {
    const coupons = await Coupon.findAll({
      attributes: { exclude: ['created_by', 'created_at', 'updated_at'] },
      order: [['id', 'DESC']]
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

    // Sanitize updates - convert empty strings to null for numeric fields
    const sanitizedUpdates = { ...updates };
    
    // Handle numeric fields - convert empty strings to null
    if (sanitizedUpdates.usage_limit === '' || sanitizedUpdates.usage_limit === undefined) {
      sanitizedUpdates.usage_limit = null;
    }
    if (sanitizedUpdates.max_discount === '' || sanitizedUpdates.max_discount === undefined) {
      sanitizedUpdates.max_discount = null;
    }
    if (sanitizedUpdates.min_booking_amount === '') {
      sanitizedUpdates.min_booking_amount = 0;
    }
    
    // Convert string numbers to actual numbers
    if (sanitizedUpdates.discount_value) {
      sanitizedUpdates.discount_value = parseFloat(sanitizedUpdates.discount_value);
    }
    if (sanitizedUpdates.usage_limit) {
      sanitizedUpdates.usage_limit = parseInt(sanitizedUpdates.usage_limit);
    }
    if (sanitizedUpdates.max_discount) {
      sanitizedUpdates.max_discount = parseFloat(sanitizedUpdates.max_discount);
    }
    if (sanitizedUpdates.min_booking_amount !== null && sanitizedUpdates.min_booking_amount !== undefined) {
      sanitizedUpdates.min_booking_amount = parseFloat(sanitizedUpdates.min_booking_amount) || 0;
    }

    await coupon.update(sanitizedUpdates);

    // Return coupon without sensitive fields
    const couponJson = coupon.toJSON();
    delete couponJson.created_by;
    delete couponJson.created_at;
    delete couponJson.updated_at;

    return res.status(200).json({
      message: 'Coupon updated successfully',
      coupon: couponJson
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

// Get auto-apply coupons for checkout
async function getAutoApplyCoupons(req, res) {
  try {
    const { bookingAmount } = req.query;

    if (!bookingAmount) {
      return res.status(400).json({ error: 'Booking amount is required' });
    }

    const amount = parseFloat(bookingAmount);

    // Find all active auto-apply coupons that are valid and meet minimum booking amount
    const coupons = await Coupon.findAll({
      attributes: { exclude: ['created_by', 'created_at', 'updated_at'] },
      where: {
        auto_apply: true,
        status: 'active',
        valid_from: { [Op.lte]: new Date() },
        valid_until: { [Op.gte]: new Date() },
        min_booking_amount: { [Op.lte]: amount }
      },
      order: [['discount_value', 'DESC']]
    });

    // Filter coupons that haven't exceeded usage limit
    const validCoupons = coupons.filter(coupon => {
      return !coupon.usage_limit || coupon.used_count < coupon.usage_limit;
    });

    // Calculate discount for each coupon and find the best one
    const couponsWithDiscount = validCoupons.map(coupon => {
      let discountAmount = 0;
      if (coupon.discount_type === 'percentage') {
        discountAmount = (amount * parseFloat(coupon.discount_value)) / 100;
        if (coupon.max_discount && discountAmount > parseFloat(coupon.max_discount)) {
          discountAmount = parseFloat(coupon.max_discount);
        }
      } else {
        discountAmount = parseFloat(coupon.discount_value);
      }

      return {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        description: coupon.description,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat((amount - discountAmount).toFixed(2))
      };
    });

    // Sort by discount amount (highest first)
    couponsWithDiscount.sort((a, b) => b.discountAmount - a.discountAmount);

    return res.status(200).json({
      coupons: couponsWithDiscount,
      bestCoupon: couponsWithDiscount[0] || null
    });

  } catch (error) {
    console.error('Get auto-apply coupons error:', error);
    return res.status(500).json({ error: 'Failed to fetch auto-apply coupons' });
  }
}

module.exports = {
  validateCoupon,
  createCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
  getCouponUsage,
  getAutoApplyCoupons
};
