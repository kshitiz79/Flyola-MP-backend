const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const CouponUsage = sequelize.define('CouponUsage', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  coupon_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Reference to coupon ID'
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    comment: 'User ID who used the coupon'
  },
  booking_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Booking ID where coupon was applied'
  },
  original_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Original booking amount before discount'
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Discount amount applied'
  },
  final_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Final amount after discount'
  },
  used_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'When the coupon was used'
  },
}, {
  tableName: 'coupon_usage',
  timestamps: false,
});

module.exports = CouponUsage;
