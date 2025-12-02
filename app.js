const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http'); // Added for HTTP server
const { Server } = require('socket.io'); // Added for Socket.IO
require('dotenv').config();

const app = express();

// Configure CORS
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://www.jetserveaviation.com',
    'https://jetserveaviation.com',
    'https://flyola.in',
    'https://www.flyola.in',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Additional CORS handling for preflight requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware to attach io to req for routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Mount routes
app.use('/', require('./src/routes/index'));
app.use('/reviews', require('./src/routes/reviews'));
app.use('/billings', require('./src/routes/billings'));
app.use('/payments', require('./src/routes/payments'));
app.use('/agents', require('./src/routes/agent'));
app.use('/bookings', require('./src/routes/bookings'));
app.use('/coupons', require('./src/routes/coupons'));
app.use('/passenger', require('./src/routes/passengerRoutes'));
app.use('/flights', require('./src/routes/flightRoutes'));
app.use('/api/joyride-slots', require('./src/routes/joyRide'));
app.use('/api/joyride-schedules', require('./src/routes/joyRideSchedules'));
app.use('/users', require('./src/routes/users'));
app.use('/booked-seat', require('./src/routes/seatRoutes'));
app.use('/flight-schedules', require('./src/routes/flightScheduleRoutes'));
app.use('/schedule-exceptions', require('./src/routes/scheduleExceptionRoutes'));
app.use('/airport', require('./src/routes/airport'));


app.use('/tickets', require('./src/routes/ticketRoutes'));
app.use('/cancellation', require('./src/routes/cancellation'));
app.use('/helicopter-cancellation', require('./src/routes/helicopterCancellation'));
app.use('/support', require('./src/routes/support'));

app.use('/helipads', require('./src/routes/helipads'));
app.use('/helicopters', require('./src/routes/helicopters'));
app.use('/helicopter-schedules', require('./src/routes/helicopterSchedules'));
app.use('/helicopter-seat', require('./src/routes/helicopterSeatRoutes'));
app.use('/api/admin', require('./src/routes/adminDashboard'));
app.use('/system-settings', require('./src/routes/systemSettingsRoutes'));


// Error handling middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Handle unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
});

module.exports = { app, io }; // Export both for potential use elsewhere