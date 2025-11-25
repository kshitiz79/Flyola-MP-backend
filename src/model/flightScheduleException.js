const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const FlightScheduleException = sequelize.define(
  'FlightScheduleException',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    exception_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    exception_type: {
      type: DataTypes.ENUM('CANCEL', 'PRICE_CHANGE', 'TIME_CHANGE', 'FULL_OVERRIDE'),
      allowNull: false,
    },
    override_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    override_departure_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    override_arrival_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    override_status: {
      type: DataTypes.TINYINT,
      allowNull: true,
      comment: '0=Cancelled, 1=Active',
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
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
    tableName: 'flight_schedule_exceptions',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['schedule_id', 'exception_date'],
      },
    ],
  }
);

FlightScheduleException.associate = (models) => {
  FlightScheduleException.belongsTo(models.FlightSchedule, {
    foreignKey: 'schedule_id',
    onDelete: 'CASCADE',
  });
  FlightScheduleException.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator',
  });
};

module.exports = FlightScheduleException;
