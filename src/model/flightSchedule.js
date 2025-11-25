const { DataTypes } = require('sequelize');
const sequelize = require('../../db2');

const FlightSchedule = sequelize.define(
    'FlightSchedule', {
        flight_id: {
            type: DataTypes.INTEGER,
            allowNull: true, // Allow null
        },
        departure_airport_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        arrival_airport_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        departure_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },
        arrival_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        via_stop_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        via_schedule_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        status: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        is_one_time: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
            comment: '0=Recurring schedule, 1=One-time special flight',
        },
        specific_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: 'Required if is_one_time=1, the exact date this flight runs',
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'flight_schedules',
        timestamps: false,
    }
);

FlightSchedule.associate = (models) => {
    FlightSchedule.belongsTo(models.Flight, {
        foreignKey: 'flight_id',
        onDelete: 'SET NULL', // Add onDelete behavior
    });
};

module.exports = FlightSchedule;