const getModels = () => require('../model');

// Get user's joyride bookings
const getUserJoyrideBookings = async (req, res) => {
  try {
    const models = getModels();
    const userId = req.user?.id || req.query.user_id;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const bookings = await models.JoyRideBooking.findAll({
      where: { user_id: userId },
      include: [
        {
          model: models.Joy_Ride_Slot,
          as: 'slot',
        },
        {
          model: models.User,
          as: 'user',
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching user joyride bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// Get all joyride bookings (admin)
const getJoyrideBookings = async (req, res) => {
  try {
    const models = getModels();
    
    const bookings = await models.JoyRideBooking.findAll({
      include: [
        {
          model: models.Joy_Ride_Slot,
          as: 'slot',
        },
        {
          model: models.User,
          as: 'user',
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching joyride bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// Create joyride booking (deprecated - redirect to new endpoints)
const createJoyrideBooking = async (req, res) => {
  return res.status(400).json({ 
    error: 'This endpoint is deprecated. Please use /api/joyride-bookings/create-order and /api/joyride-bookings/verify-payment' 
  });
};

// Additional functions for compatibility
const getAllBookings = async (req, res) => {
  return getJoyrideBookings(req, res);
};

const getBookingById = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    
    const booking = await models.JoyRideBooking.findByPk(id, {
      include: [
        {
          model: models.Joy_Ride_Slot,
          as: 'slot',
        },
        {
          model: models.User,
          as: 'user',
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    const { status } = req.body;
    
    const booking = await models.JoyRideBooking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await booking.update({ status });
    res.json({ message: 'Booking status updated successfully' });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const models = getModels();
    const { id } = req.params;
    
    const booking = await models.JoyRideBooking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await booking.update({ status: 'cancelled' });
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// Placeholder functions for payment integration
const createOrder = async (req, res) => {
  return res.status(501).json({ error: 'Payment integration not implemented' });
};

const verifyPayment = async (req, res) => {
  return res.status(501).json({ error: 'Payment integration not implemented' });
};

module.exports = {
  createOrder,
  verifyPayment,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  getUserJoyrideBookings,
  getJoyrideBookings,
  createJoyrideBooking
};