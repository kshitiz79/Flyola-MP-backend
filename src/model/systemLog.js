const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const SystemLog = sequelize.define('SystemLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  level: {
    type: DataTypes.ENUM('ERROR', 'WARNING', 'INFO', 'DEBUG'),
    allowNull: false,
    defaultValue: 'INFO'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  source: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  line_number: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  user_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  payment_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  booking_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'system_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SystemLog;