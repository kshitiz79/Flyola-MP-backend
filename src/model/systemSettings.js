const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const SystemSettings = sequelize.define('SystemSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  setting_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Unique key for the setting (e.g., booking_cutoff_time)'
  },
  setting_value: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Value of the setting (can be JSON string for complex values)'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Description of what this setting does'
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID of admin who last updated this setting'
  }
}, {
  tableName: 'system_settings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SystemSettings;
