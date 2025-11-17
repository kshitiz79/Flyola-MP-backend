const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique coupon code (e.g., FLYOLA50, SUMMER2024)'
  },
  discount_type: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false,
    defaultValue: 'percentage',
    comment: 'Type of discount: percentage or fixed amount'
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Discount value (percentage or fixed amount)'
  },
  max_discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Maximum discount amount (for percentage type)'
  },
  min_booking_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    comment: 'Minimum booking amount required to use coupon'
  },
  usage_limit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Total number of times coupon can be used (null = unlimited)'
  },
  used_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of times coupon has been used'
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Coupon valid from date'
  },
  valid_until: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Coupon expiry date'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'expired'),
    allowNull: false,
    defaultValue: 'active',
    comment: 'Coupon status'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Coupon description'
  },
  created_by: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    comment: 'Admin user ID who created the coupon'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'coupons',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Coupon;
