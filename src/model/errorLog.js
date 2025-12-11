const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const ErrorLog = sequelize.define('ErrorLog', {
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
  severity: {
    type: DataTypes.ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
    allowNull: false,
    defaultValue: 'MEDIUM'
  },
  error_code: {
    type: DataTypes.STRING(50),
    allowNull: true
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
  stack_trace: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  context: {
    type: DataTypes.JSON,
    allowNull: true
  },
  resolved: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  resolved_by: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'error_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ErrorLog;