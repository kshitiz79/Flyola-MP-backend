const models = require('../model');
const Coupon = require('../model/coupon');
const CouponUsage = require('../model/couponUsage');
const { Op } = require('sequelize');

// Get comprehensive coupon usage statistics
async function getCouponUsageStats(req, res) {
  try {
    const { startDate, endDate, couponId } = req.query;

    // Build where clause for filtering
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.used_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    if (couponId) {
      whereClause.coupon_id = couponId;
    }

    // Get total discount amount
    const totalStats = await CouponUsage.findOne({
      attributes: [
        [models.sequelize.fn('SUM', models.sequelize.col('discount_amount')), 'totalDiscount'],
        [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'totalUsage'],
        [models.sequelize.fn('SUM', models.sequelize.col('original_amount')), 'totalOriginalAmount'],
        [models.sequelize.fn('SUM', models.sequelize.col('final_amount')), 'totalFinalAmount']
      ],
      where: whereClause,
      raw: true
    });

    // Get usage by coupon
    const usageByCoupon = await CouponUsage.findAll({
      attributes: [
        'coupon_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('CouponUsage.id')), 'usageCount'],
        [models.sequelize.fn('SUM', models.sequelize.col('discount_amount')), 'totalDiscount'],
        [models.sequelize.fn('AVG', models.sequelize.col('discount_amount')), 'avgDiscount']
      ],
      where: whereClause,
      include: [
        {
          model: Coupon,
          as: 'coupon',
          attributes: ['id', 'code', 'discount_type', 'discount_value', 'description']
        }
      ],
      group: ['coupon_id', 'coupon.id'],
      raw: false
    });

    // Get recent usage history with details
    const recentUsage = await CouponUsage.findAll({
      where: whereClause,
      include: [
        {
          model: Coupon,
          as: 'coupon',
          attributes: ['code', 'discount_type', 'discount_value']
        }
      ],
      order: [['used_at', 'DESC']],
      limit: 100
    });

    return res.status(200).json({
      summary: {
        totalDiscount: parseFloat(totalStats?.totalDiscount || 0).toFixed(2),
        totalUsage: parseInt(totalStats?.totalUsage || 0),
        totalOriginalAmount: parseFloat(totalStats?.totalOriginalAmount || 0).toFixed(2),
        totalFinalAmount: parseFloat(totalStats?.totalFinalAmount || 0).toFixed(2),
        averageDiscount: totalStats?.totalUsage > 0 
          ? parseFloat(totalStats.totalDiscount / totalStats.totalUsage).toFixed(2) 
          : '0.00'
      },
      usageByCoupon: usageByCoupon.map(item => ({
        couponId: item.coupon_id,
        couponCode: item.coupon?.code,
        couponType: item.coupon?.discount_type,
        couponValue: item.coupon?.discount_value,
        description: item.coupon?.description,
        usageCount: parseInt(item.getDataValue('usageCount')),
        totalDiscount: parseFloat(item.getDataValue('totalDiscount')).toFixed(2),
        avgDiscount: parseFloat(item.getDataValue('avgDiscount')).toFixed(2)
      })),
      recentUsage: recentUsage.map(usage => ({
        id: usage.id,
        couponCode: usage.coupon?.code,
        userId: usage.user_id,
        bookingId: usage.booking_id,
        originalAmount: parseFloat(usage.original_amount).toFixed(2),
        discountAmount: parseFloat(usage.discount_amount).toFixed(2),
        finalAmount: parseFloat(usage.final_amount).toFixed(2),
        usedAt: usage.used_at
      }))
    });

  } catch (error) {
    console.error('Get coupon usage stats error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch coupon usage statistics',
      details: error.message,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get detailed usage for a specific coupon
async function getCouponDetailedUsage(req, res) {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    const usage = await CouponUsage.findAll({
      where: { coupon_id: couponId },
      order: [['used_at', 'DESC']]
    });

    const totalDiscount = usage.reduce((sum, u) => sum + parseFloat(u.discount_amount), 0);

    return res.status(200).json({
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        used_count: coupon.used_count,
        usage_limit: coupon.usage_limit
      },
      totalDiscount: totalDiscount.toFixed(2),
      usageCount: usage.length,
      usage: usage.map(u => ({
        id: u.id,
        userId: u.user_id,
        bookingId: u.booking_id,
        originalAmount: parseFloat(u.original_amount).toFixed(2),
        discountAmount: parseFloat(u.discount_amount).toFixed(2),
        finalAmount: parseFloat(u.final_amount).toFixed(2),
        usedAt: u.used_at
      }))
    });

  } catch (error) {
    console.error('Get detailed coupon usage error:', error);
    return res.status(500).json({ error: 'Failed to fetch detailed usage' });
  }
}

module.exports = {
  getCouponUsageStats,
  getCouponDetailedUsage
};
