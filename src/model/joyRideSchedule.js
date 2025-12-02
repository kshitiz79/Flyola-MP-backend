const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const JoyRideSchedule = sequelize.define('JoyRideSchedule', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  departure_day: {
    type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    allowNull: false,
    comment: 'Day of week for this schedule'
  },
  start_helipad_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Starting helipad'
  },
  stop_helipad_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Ending helipad'
  },
  departure_time: {
    type: DataTypes.TIME,
    allowNull: false,
    comment: 'Departure time'
  },
  arrival_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Arrival time'
  },
  seat_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 6,
    comment: 'Maximum seats available'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Price per seat in INR'
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '1=Active, 0=Inactive'
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
  tableName: 'joy_ride_schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = JoyRideSchedule;
