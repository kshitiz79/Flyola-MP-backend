const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const HelicopterPayment = sequelize.define(
  'HelicopterPayment',
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
      allowNull: true,
    },
    payment_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payment_mode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payment_amount: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    helicopter_booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
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
    tableName: 'helicopter_payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

HelicopterPayment.associate = (models) => {
  HelicopterPayment.belongsTo(models.HelicopterBooking, {
    foreignKey: 'helicopter_booking_id',
    targetKey: 'id',
    onDelete: 'CASCADE',
  });
  HelicopterPayment.belongsTo(models.User, {
    foreignKey: 'user_id',
    targetKey: 'id',
    onDelete: 'RESTRICT',
  });
};

module.exports = HelicopterPayment;
