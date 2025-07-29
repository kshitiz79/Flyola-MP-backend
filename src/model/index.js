const sequelize = require('../../db2');
const { Sequelize } = require('sequelize');

const models = {
  BookedSeat: require('./bookedSeat'),
  Booking: require('./booking'),
  Payment: require('./payment'),
  Billing: require('./billing'),
  FlightSchedule: require('./flightSchedule'),
  Flight: require('./flight'),
  Airport: require('./airport'),
  User: require('./user'),
  Passenger: require('./passanger'),
  Agent: require('./Agent'),
  SeatHold: require('./seatHold'), 
  Joy_Ride_Slot: require('./joyRide'),
  JoyRideBooking : require('./joyRideBooking'),
  Refund: require('./refund'),

  sequelize,
  Sequelize,
};

Object.keys(models).forEach(name => {
  if (typeof models[name].associate === 'function') models[name].associate(models);
});

models.FlightSchedule.belongsTo(models.Airport, { as: 'DepartureAirport', foreignKey: 'departure_airport_id' });
models.FlightSchedule.belongsTo(models.Airport, { as: 'ArrivalAirport', foreignKey: 'arrival_airport_id' });
models.FlightSchedule.belongsTo(models.Flight, { foreignKey: 'flight_id' });
models.BookedSeat.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });
models.Booking.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });
models.Booking.belongsTo(models.User, { foreignKey: 'bookedUserId' });
models.Booking.hasMany(models.Passenger, { foreignKey: 'bookingId' });
models.Payment.belongsTo(models.Booking, { foreignKey: 'booking_id' });

models.Payment.belongsTo(models.User, { foreignKey: 'user_id' });
models.Billing.belongsTo(models.User, { foreignKey: 'user_id' });
models.Flight.hasMany(models.FlightSchedule, { foreignKey: 'flight_id' });
models.Passenger.belongsTo(models.Booking, { foreignKey: 'bookingId' });
models.Booking.belongsTo(models.Agent, { foreignKey: 'agentId', onDelete: 'SET NULL' }); // New relationship
models.Booking.hasMany(models.BookedSeat, { foreignKey: 'booking_id' });
models.Booking.hasMany(models.Refund, { foreignKey: 'booking_id' });
models.SeatHold.belongsTo(models.FlightSchedule, { foreignKey: 'schedule_id' });

module.exports = models;