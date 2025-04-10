// models/flightSchedule.js
const { DataTypes } = require('sequelize');
const sequelize = require('./../../db2'); // Database connection

const FlightSchedule = sequelize.define('FlightSchedule', {
  flight_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  departure_airport_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  arrival_airport_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  departure_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  arrival_time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  via_stop_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  via_schedule_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
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
}, {
  tableName: 'flight_schedules',
  timestamps: false, // Disable automatic timestamp fields management by Sequelize
});

module.exports = FlightSchedule;
