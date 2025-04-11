const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Updated to ../../db

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
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'airports',
  timestamps: false,
});

module.exports = Airport;