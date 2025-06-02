const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

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
      allowNull: true, // Already correct for email signups
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    number: {
      type: DataTypes.STRING,
      allowNull: true, // Changed to allow null for email signups
      unique: true,
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    marital_status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    anniversary_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    nationality: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profile_picture: {
      type: DataTypes.STRING, // store image URL or filename
      allowNull: true,
    },
    pan_card_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
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

User.associate = (models) => {
  User.hasMany(models.Booking, { foreignKey: 'bookedUserId' });
  User.hasMany(models.Payment, { foreignKey: 'user_id' });
  User.hasMany(models.Billing, { foreignKey: 'user_id' });
};

module.exports = User;