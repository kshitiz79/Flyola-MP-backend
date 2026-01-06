const { DataTypes } = require('sequelize');
const sequelize = require('./../../db2');

const Payment = sequelize.define(
  'Payment',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payment_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    payment_status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDING',
    },
    payment_mode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payment_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    refund_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    refund_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

// Associations
Payment.associate = (models) => {
  Payment.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'Booking' });
};

module.exports = Payment;