const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Updated from ../../db2

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
    type: DataTypes.JSON,
    allowNull: true,
  },
  seat_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  tableName: 'flights',
  timestamps: false,
});

// Add debugging
console.log('Flight model defined:', Flight !== undefined);

module.exports = Flight;