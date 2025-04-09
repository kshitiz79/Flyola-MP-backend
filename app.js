// server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

const corsOptions = {
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Mount your routes
app.use('/', require('./src/routes/index'));
app.use('/users', require('./src/routes/users'));
app.use('/bookings', require('./src/routes/bookings'));
app.use('/booked-seat', require('./src/routes/bookedSeates'));
app.use('/flights', require('./src/routes/flights'));
app.use('/reviews', require('./src/routes/reviews'));
app.use('/billings', require('./src/routes/billings'));
app.use('/flight-schedules', require('./src/routes/flightschedules'));

app.use('/api/booking', require('./src/routes/booking'));




const airportRoutes = require('./src/routes/airport');
app.use('/airport', airportRoutes);

app.listen(4000, () => {
  console.log('Server is running on port 4000');
});

module.exports = app;
