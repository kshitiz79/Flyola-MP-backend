const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Adjust path to match your setup

const Slot = sequelize.define('Joy_Ride_Slot', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  seats: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Price per seat in INR',
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
  tableName: 'joy_ride_slots',
  timestamps: false,
  indexes: [
    {
      name: 'idx_date',
      fields: ['date'],
    },
  ],
});

module.exports = Slot;