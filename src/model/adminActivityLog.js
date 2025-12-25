const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const AdminActivityLog = sequelize.define('AdminActivityLog', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  admin_user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  admin_email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  admin_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  resource_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'e.g., flight_schedule, user, hotel, etc.'
  },
  resource_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'ID of the affected resource'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'),
    allowNull: false,
    defaultValue: 'SUCCESS'
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'admin_activity_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = AdminActivityLog;