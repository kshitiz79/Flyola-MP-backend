// server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

const corsOptions = {
  origin: ['http://localhost:3000', 'https://flyola.in'], // Allow both localhost and flyola.in
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




app.use('/reviews', require('./src/routes/reviews'));
app.use('/billings', require('./src/routes/billings'));





app.use('/payments', require('./src/routes/payments'));


console.log('Environment variables loaded:', {
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? '[REDACTED]' : 'undefined',
});



// No changes needed, but ensure this line exists:
app.use('/bookings', require('./src/routes/bookings'));



app.use('/booked-seat', require('./src/routes/bookedSeates'));


app.use('/passenger', require('./src/routes/passengerRoutes'));



const flightRoutes = require('./src/routes/flightRoutes');

app.use('/flights', flightRoutes);




const userRoutes = require('./src/routes/users');
app.use('/users', userRoutes);




const flightScheduleRoutes = require('./src/routes/flightScheduleRoutes');
app.use('/flight-schedules', flightScheduleRoutes);


const airportRoutes = require('./src/routes/airport');
app.use('/airport', airportRoutes);





// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


module.exports = app;