const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const Booking = sequelize.define(
  'Booking',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    pnr: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bookingNo: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    contact_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    noOfPassengers: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bookDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    totalFare: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentStatus: {
      type: DataTypes.STRING,
      defaultValue: 'PENDING',
    },
    bookingStatus: {
      type: DataTypes.STRING,
      defaultValue: 'PENDING',
    },
    bookedUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pay_amt: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pay_mode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    discount: {
      type: DataTypes.STRING,
      defaultValue: '0',
    },
    agent_type: {
      type: DataTypes.ENUM('flyola', 'IRCTC'),
      defaultValue: 'flyola',
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
    tableName: 'bookings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

Booking.associate = (models) => {
  Booking.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id', targetKey: 'id', onDelete: 'SET NULL' });
  Booking.hasMany(models.Payment, { foreignKey: 'booking_id', sourceKey: 'id' });
  Booking.belongsTo(models.User, { foreignKey: 'bookedUserId', targetKey: 'id' });
  Booking.hasMany(models.Passenger, { foreignKey: 'bookingId', sourceKey: 'id' });
  Booking.hasMany(models.BookedSeat, { foreignKey: 'booking_id', sourceKey: 'id' }); // Fixed relationship
};

module.exports = Booking;