// models/airport.js
const { DataTypes } = require('sequelize');
const sequelize = require('./../../db2'); // Database connection


// Define the Airport model
const Airport = sequelize.define('Airport', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  city: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  airport_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  airport_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,  // Use DataTypes.DATE for timestamp columns
    defaultValue: DataTypes.NOW,  // Default to the current time
  },
  updated_at: {
    type: DataTypes.DATE,  // Use DataTypes.DATE for timestamp columns
    defaultValue: DataTypes.NOW,  // Default to the current time
  },
}, {
  tableName: 'airports',
  timestamps: false,  // Disable automatic timestamp management by Sequelize
});

module.exports = Airport;
