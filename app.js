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
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
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
app.use('/passenger', require('./src/routes/passengerRoutes'));
app.use('/flights', require('./src/routes/flightRoutes'));
app.use('/api/joyride-slots', require('./src/routes/joyRide'));
app.use('/users', require('./src/routes/users'));
app.use('/booked-seat', require('./src/routes/seatRoutes'));
app.use('/flight-schedules', require('./src/routes/flightScheduleRoutes'));
app.use('/airport', require('./src/routes/airport'));
app.use('/coupons', require('./src/routes/coupans'));
app.use('/tickets', require('./src/routes/ticketRoutes'));

// Error handling middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// Handle unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, io }; // Export both for potential use elsewhere