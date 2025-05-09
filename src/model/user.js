const { DataTypes } = require('sequelize');
const sequelize = require('../../db2'); // Updated from ../../db2

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.INTEGER,
      defaultValue: 3, // 1 for admin, 3 for user
    },
    remember_token: {
      type: DataTypes.STRING,
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
  },
  {
    tableName: 'users',
    timestamps: false,
  }
);

// Associations (called by index.js)
User.associate = (models) => {
  User.hasMany(models.Booking, { foreignKey: 'bookedUserId' });
  User.hasMany(models.Payment, { foreignKey: 'user_id' });
  User.hasMany(models.Billing, { foreignKey: 'user_id' });
};

module.exports = User;