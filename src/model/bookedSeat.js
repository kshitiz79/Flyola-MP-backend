const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const BookedSeat = sequelize.define(
  'BookedSeat',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    seat_label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    booked_seat: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
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
    tableName: 'booked_seats',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['booking_id', 'seat_label'],
        name: 'unique_booking_seat',
      },
      {
        fields: ['schedule_id', 'bookDate'],
        name: 'schedule_date_idx',
      },
    ],
  }
);

BookedSeat.associate = (models) => {
  BookedSeat.belongsTo(models.Booking, { foreignKey: 'booking_id' });
  BookedSeat.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });
};

module.exports = BookedSeat;