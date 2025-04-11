const sequelize = require('../../db2');
const { Sequelize } = require('sequelize');

const models = {
  BookedSeat: require('./bookedSeat'), // 确保路径正确
  Booking: require('./booking'),
  Payment: require('./payment'),
  Billing: require('./billing'),
  FlightSchedule: require('./flightSchedule'),
  Flight: require('./flight'),
  Airport: require('./airport'),
  User: require('./user'),
  sequelize,
  Sequelize,
};

// Log the loaded models to verify
console.log('Models loaded:', Object.keys(models));
console.log('BookedSeat:', models.BookedSeat ? 'Defined' : 'Undefined');
console.log('FlightSchedule:', models.FlightSchedule ? 'Defined' : 'Undefined');
console.log('Flight:', models.Flight ? 'Defined' : 'Undefined');

// Define all associations
models.FlightSchedule.belongsTo(models.Airport, { as: 'DepartureAirport', foreignKey: 'departure_airport_id' });
models.FlightSchedule.belongsTo(models.Airport, { as: 'ArrivalAirport', foreignKey: 'arrival_airport_id' });
models.FlightSchedule.belongsTo(models.Flight, { foreignKey: 'flight_id' });

models.BookedSeat.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });

models.Booking.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });
models.Booking.belongsTo(models.User, { foreignKey: 'bookedUserId' });
models.Booking.hasMany(models.Payment, { foreignKey: 'booking_id' });

models.Payment.belongsTo(models.Booking, { foreignKey: 'booking_id' });
models.Payment.belongsTo(models.User, { foreignKey: 'user_id' });

models.Billing.belongsTo(models.User, { foreignKey: 'user_id' });

models.Flight.hasMany(models.FlightSchedule, { foreignKey: 'flight_id' });

module.exports = models;