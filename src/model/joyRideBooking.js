const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Adjust path to match your setup

const JoyRideBooking = sequelize.define('JoyRideBooking', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  slot_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: {
      model: 'joy_ride_slots',
      key: 'id',
    },
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  passengers: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Array of objects with name and weight',
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Total price including extra weight charges',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
  },
}, {
  tableName: 'joyride_bookings',
  timestamps: false,
  indexes: [
    {
      name: 'idx_slot_id',
      fields: ['slot_id'],
    },
  ],
});

// Define relationship
JoyRideBooking.associate = (models) => {
  JoyRideBooking.belongsTo(models.Joy_Ride_Slot, {
    foreignKey: 'slot_id',
    as: 'slot',
  });
};

module.exports = JoyRideBooking;