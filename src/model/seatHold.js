// File: models/seatHold.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const SeatHold = sequelize.define(
  'SeatHold',
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
    tableName: 'seat_holds',
    timestamps: false,
  }
);

SeatHold.associate = (models) => {
  SeatHold.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });
};

module.exports = SeatHold;