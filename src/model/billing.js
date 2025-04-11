const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Updated from ../../db2

const Billing = sequelize.define(
  'Billing',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    billing_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_country: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    billing_pin_code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    GST_Number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    tableName: 'billing_details', // Updated from 'billings'
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

// Associations (called by index.js)
Billing.associate = (models) => {
  Billing.belongsTo(models.User, { foreignKey: 'user_id' });
};

module.exports = Billing;