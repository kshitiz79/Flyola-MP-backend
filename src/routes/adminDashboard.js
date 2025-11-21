const express = require('express');
const router = express.Router();
const models = require('../model');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/admin/dashboard-stats
 * Single endpoint to fetch all admin dashboard data
 * Returns: flights, schedules, airports, bookings, passengers, users, reviews, payments, joyride data
 */
router.get('/dashboard-stats', authenticate([1]), async (req, res) => {
    try {
        // Fetch all data in parallel for better performance using Sequelize models
        const [
            flights,
            schedules,
            airports,
            bookings,
            passengers,
            users,
            reviews,
            payments,
            joyrideBookings,
            joyrideSlots
        ] = await Promise.all([
            // Flights
            models.Flight ? models.Flight.findAll().catch(() => []) : Promise.resolve([]),

            // Flight Schedules
            models.FlightSchedule ? models.FlightSchedule.findAll().catch(() => []) : Promise.resolve([]),

            // Airports
            models.Airport ? models.Airport.findAll().catch(() => []) : Promise.resolve([]),

            // Bookings
            models.Booking ? models.Booking.findAll().catch(() => []) : Promise.resolve([]),

            // Passengers
            models.Passenger ? models.Passenger.findAll().catch(() => []) : Promise.resolve([]),

            // Users (exclude password)
            models.User ? models.User.findAll({
                attributes: { exclude: ['password'] }
            }).catch(() => []) : Promise.resolve([]),

            // Reviews
            models.Review ? models.Review.findAll().catch(() => []) : Promise.resolve([]),

            // Payments
            models.Payment ? models.Payment.findAll().catch(() => []) : Promise.resolve([]),

            // Joyride Bookings
            models.JoyrideBooking ? models.JoyrideBooking.findAll().catch(() => []) : Promise.resolve([]),

            // Joyride Slots
            models.JoyrideSlot ? models.JoyrideSlot.findAll().catch(() => []) : Promise.resolve([])
        ]);

        // Return all data in a single response
        res.json({
            success: true,
            data: {
                flights: flights || [],
                schedules: schedules || [],
                airports: airports || [],
                bookings: bookings || [],
                passengers: passengers || [],
                users: users || [],
                reviews: reviews || [],
                payments: payments || [],
                joyrideBookings: joyrideBookings || [],
                joyrideSlots: joyrideSlots || []
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
});

module.exports = router;
