const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

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
  status: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1, // Default to active
    validate: {
      isIn: [[0, 1]], // Restrict to 0 (inactive) or 1 (active)
    },
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
  tableName: 'airports',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Airport;