// File: models/helicopterSeatHold.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const HelicopterSeatHold = sequelize.define(
  'HelicopterSeatHold',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    seat_label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    held_by: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    held_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'helicopter_seat_holds',
    timestamps: false,
  }
);

HelicopterSeatHold.associate = (models) => {
  HelicopterSeatHold.belongsTo(models.HelicopterSchedule, { foreignKey: 'schedule_id' });
};

module.exports = HelicopterSeatHold;
