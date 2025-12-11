const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const ApiRequestLog = sequelize.define('ApiRequestLog', {
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
  method: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  url: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  status_code: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in milliseconds'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  request_body: {
    type: DataTypes.JSON,
    allowNull: true
  },
  response_body: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'api_request_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false // Only created_at, no updated_at for request logs
});

module.exports = ApiRequestLog;