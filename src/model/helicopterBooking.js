const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const HelicopterBooking = sequelize.define(
  'HelicopterBooking',
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
    helicopter_schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    agentId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
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
    tableName: 'helicopter_bookings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

HelicopterBooking.associate = (models) => {
  HelicopterBooking.belongsTo(models.HelicopterSchedule, { 
    foreignKey: 'helicopter_schedule_id', 
    targetKey: 'id', 
    onDelete: 'RESTRICT' 
  });
  HelicopterBooking.belongsTo(models.User, { 
    foreignKey: 'bookedUserId', 
    targetKey: 'id' 
  });
  HelicopterBooking.belongsTo(models.Agent, { 
    foreignKey: 'agentId', 
    targetKey: 'id', 
    onDelete: 'SET NULL' 
  });
  HelicopterBooking.hasMany(models.HelicopterPassenger, { 
    foreignKey: 'helicopter_bookingId', 
    sourceKey: 'id',
    as: 'Passengers'
  });
  HelicopterBooking.hasMany(models.HelicopterBookedSeat, { 
    foreignKey: 'helicopter_booking_id', 
    sourceKey: 'id',
    as: 'BookedSeats'
  });
  HelicopterBooking.hasMany(models.HelicopterPayment, { 
    foreignKey: 'helicopter_booking_id', 
    sourceKey: 'id',
    as: 'Payments'
  });
};

module.exports = HelicopterBooking;
