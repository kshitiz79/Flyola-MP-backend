// models/flight.js
const { DataTypes } = require('sequelize');
const sequelize = require('./../../db2'); // Import the database connection

const Flight = sequelize.define('Flight', {
  flight_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  departure_day: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  start_airport_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  end_airport_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  airport_stop_ids: {
    type: DataTypes.JSON, // Array of airport IDs for stops
    allowNull: true,
  },
  seat_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.INTEGER, // 0 for inactive, 1 for active
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
}, {
  tableName: 'flights',
  timestamps: false, // Disable automatic timestamp management by Sequelize
});

module.exports = Flight;
