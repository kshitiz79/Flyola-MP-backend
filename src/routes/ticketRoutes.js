const express = require('express');
const router = express.Router();
const { Booking, Passenger, FlightSchedule, Airport, Flight, Payment } = require('../model');

// Get ticket data by booking ID or PNR
router.get('/ticket/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    // Find booking by PNR or booking number
    const booking = await Booking.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { pnr: identifier },
          { bookingNo: identifier },
          { id: identifier }
        ]
      },
      include: [
        {
          model: Passenger
        },
        {
          model: FlightSchedule
        },
        {
          model: Payment
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Get airport details
    const departureAirport = await Airport.findByPk(booking.FlightSchedule?.departure_airport_id);
    const arrivalAirport = await Airport.findByPk(booking.FlightSchedule?.arrival_airport_id);

    // Format the ticket data
    const ticketData = {
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        bookDate: booking.bookDate,
        totalFare: booking.totalFare,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        noOfPassengers: booking.noOfPassengers,
        contact_no: booking.contact_no,
        email_id: booking.email_id
      },
      flight: {
        id: booking.FlightSchedule?.flight_id || 'FL001',
        departure: departureAirport?.airport_name || 'Unknown Airport',
        arrival: arrivalAirport?.airport_name || 'Unknown Airport',
        departureCode: departureAirport?.airport_code || 'UNK',
        arrivalCode: arrivalAirport?.airport_code || 'UNK',
        departureTime: booking.FlightSchedule?.departure_time || '00:00',
        arrivalTime: booking.FlightSchedule?.arrival_time || '00:00',
        selectedDate: booking.bookDate,
        totalPrice: booking.totalFare
      },
      passengers: booking.Passengers?.map(passenger => ({
        id: passenger.id,
        name: passenger.name,
        fullName: passenger.name,
        title: passenger.title,
        age: passenger.age,
        dateOfBirth: passenger.dob,
        type: passenger.type,
        email: booking.email_id,
        phone: booking.contact_no
      })) || [],
      payment: booking.Payments?.[0] || null
    };

    res.json({
      success: true,
      data: ticketData
    });

  } catch (error) {
    console.error('Error fetching ticket data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get all bookings for testing
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      include: [
        {
          model: Passenger
        },
        {
          model: FlightSchedule
        },
        {
          model: Payment
        }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      count: bookings.length,
      data: bookings
    });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Test endpoint to check database connection and data
router.get('/test-data', async (req, res) => {
  try {
    const bookingCount = await Booking.count();
    const passengerCount = await Passenger.count();
    const flightScheduleCount = await FlightSchedule.count();
    const airportCount = await Airport.count();

    const latestBooking = await Booking.findOne({
      include: [
        {
          model: Passenger
        },
        {
          model: FlightSchedule
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      counts: {
        bookings: bookingCount,
        passengers: passengerCount,
        flightSchedules: flightScheduleCount,
        airports: airportCount
      },
      latestBooking: latestBooking,
      message: 'Database connection successful'
    });

  } catch (error) {
    console.error('Error testing data:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Get ticket data for the get-ticket page
router.get('/get-ticket', async (req, res) => {
  try {
    // Get the latest booking or a specific one if ID is provided
    const bookingId = req.query.id;
    const pnr = req.query.pnr;
    let booking;
    
    if (bookingId) {
      booking = await Booking.findByPk(bookingId, {
        include: [
          {
            model: Passenger
          },
          {
            model: FlightSchedule
          },
          {
            model: Payment
          }
        ]
      });
    } else if (pnr) {
      booking = await Booking.findOne({
        where: { pnr: pnr },
        include: [
          {
            model: Passenger
          },
          {
            model: FlightSchedule
          },
          {
            model: Payment
          }
        ]
      });
    } else {
      booking = await Booking.findOne({
        include: [
          {
            model: Passenger
          },
          {
            model: FlightSchedule
          },
          {
            model: Payment
          }
        ],
        order: [['created_at', 'DESC']]
      });
    }

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'No booking found. Please check your PNR or booking details.'
      });
    }

    console.log("Found booking:", JSON.stringify(booking, null, 2));
    console.log("FlightSchedule:", booking.FlightSchedule);
    console.log("Passengers:", booking.Passengers);

    // Get airport details
    const departureAirport = await Airport.findByPk(booking.FlightSchedule?.departure_airport_id);
    const arrivalAirport = await Airport.findByPk(booking.FlightSchedule?.arrival_airport_id);

    console.log("Departure Airport:", departureAirport);
    console.log("Arrival Airport:", arrivalAirport);

    // Format the ticket data with real booking information
    const ticketData = {
      booking: {
        id: booking.id,
        pnr: booking.pnr,
        bookingNo: booking.bookingNo,
        bookDate: booking.bookDate,
        totalFare: parseFloat(booking.totalFare),
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        noOfPassengers: booking.noOfPassengers,
        contact_no: booking.contact_no,
        email_id: booking.email_id,
        transactionId: booking.transactionId,
        paymentId: booking.paymentId,
        discount: booking.discount
      },
      flight: {
        id: booking.FlightSchedule?.flight_id || booking.schedule_id || 'FL001',
        departure: departureAirport?.airport_name || departureAirport?.city || 'Unknown Airport',
        arrival: arrivalAirport?.airport_name || arrivalAirport?.city || 'Unknown Airport',
        departureCode: departureAirport?.airport_code || 'UNK',
        arrivalCode: arrivalAirport?.airport_code || 'UNK',
        departureTime: booking.FlightSchedule?.departure_time || '00:00:00',
        arrivalTime: booking.FlightSchedule?.arrival_time || '00:00:00',
        selectedDate: booking.bookDate,
        totalPrice: parseFloat(booking.totalFare),
        price: booking.FlightSchedule?.price ? parseFloat(booking.FlightSchedule.price) : parseFloat(booking.totalFare)
      },
      passengers: booking.Passengers?.map(passenger => ({
        id: passenger.id,
        name: passenger.name,
        fullName: passenger.name,
        title: passenger.title || 'Mr',
        age: passenger.age,
        dateOfBirth: passenger.dob,
        type: passenger.type || 'Adult',
        email: booking.email_id,
        phone: booking.contact_no
      })) || [],
      payment: booking.Payments?.[0] ? {
        id: booking.Payments[0].id,
        amount: parseFloat(booking.Payments[0].amount || booking.totalFare),
        status: booking.Payments[0].status || booking.paymentStatus,
        paymentMethod: booking.Payments[0].payment_method || booking.pay_mode || 'Online',
        transactionId: booking.Payments[0].transaction_id || booking.transactionId
      } : {
        amount: parseFloat(booking.totalFare),
        status: booking.paymentStatus,
        paymentMethod: booking.pay_mode || 'Online',
        transactionId: booking.transactionId
      }
    };

    res.json({
      success: true,
      data: ticketData
    });

  } catch (error) {
    console.error('Error fetching ticket data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;