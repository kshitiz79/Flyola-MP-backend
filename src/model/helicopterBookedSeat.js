const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const HelicopterBookedSeat = sequelize.define(
  'HelicopterBookedSeat',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    helicopter_booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    helicopter_schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    seat_label: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    booked_seat: {
      type: DataTypes.TINYINT,
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
    tableName: 'helicopter_booked_seats',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

HelicopterBookedSeat.associate = (models) => {
  HelicopterBookedSeat.belongsTo(models.HelicopterBooking, {
    foreignKey: 'helicopter_booking_id',
    targetKey: 'id',
    onDelete: 'CASCADE',
  });
  HelicopterBookedSeat.belongsTo(models.HelicopterSchedule, {
    foreignKey: 'helicopter_schedule_id',
    targetKey: 'id',
    onDelete: 'CASCADE',
  });
};

module.exports = HelicopterBookedSeat;
