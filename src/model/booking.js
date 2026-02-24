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
  type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'SUCCESS'),
  defaultValue: 'PENDING',
},
    bookedUserId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true, // Allow NULL for guest bookings
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
    agentId: {
      type: DataTypes.BIGINT.UNSIGNED, // Matches Agent.id
      allowNull: true, // Allow null for bookings not tied to an agent
    },
    guest_booking: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'True if booking made without login',
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Email for guest bookings',
    },
    guest_phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Phone for guest bookings',
    },
    booking_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Expiry time for pending bookings (15 min)',
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    cancellationCharges: {
      type: DataTypes.DECIMAL(10, 2),
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
    tableName: 'bookings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

Booking.associate = (models) => {
  Booking.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id', targetKey: 'id', onDelete: 'SET NULL' });
  // HelicopterSchedule association removed - helicopter bookings now use separate helicopter_bookings table
  Booking.hasMany(models.Payment, { foreignKey: 'booking_id', sourceKey: 'id', as: 'Payments' });
  Booking.belongsTo(models.User, { foreignKey: 'bookedUserId', targetKey: 'id' });
  Booking.hasMany(models.Passenger, { foreignKey: 'bookingId', sourceKey: 'id' });
  Booking.hasMany(models.BookedSeat, { foreignKey: 'booking_id', sourceKey: 'id' });
  Booking.belongsTo(models.Agent, { foreignKey: 'agentId', targetKey: 'id', onDelete: 'SET NULL' });
};

module.exports = Booking;