const { JoyRideSchedule, Helipad } = require('../model');
const { Op } = require('sequelize');

// Get all joy ride schedules
const getJoyRideSchedules = async (req, res) => {
  try {
    const { day, status } = req.query;
    const where = {};
    
    if (day) where.departure_day = day;
    if (status) where.status = parseInt(status);
    
    const schedules = await JoyRideSchedule.findAll({
      where,
      include: [
        {
          model: Helipad,
          as: 'startHelipad',
          attributes: ['id', 'helipad_name', 'helipad_code', 'city']
        },
        {
          model: Helipad,
          as: 'stopHelipad',
          attributes: ['id', 'helipad_name', 'helipad_code', 'city']
        }
      ],
      order: [
        ['departure_day', 'ASC'],
        ['departure_time', 'ASC']
      ]
    });
    
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch joy ride schedules: ' + err.message });
  }
};

// Create a new joy ride schedule
const createJoyRideSchedule = async (req, res) => {
  try {
    const {
      departureDay,
      startHelipadId,
      stopHelipadId,
      departureTime,
      arrivalTime,
      seatLimit,
      price,
      status
    } = req.body;

    // Validate required fields
    if (!departureDay || !startHelipadId || !stopHelipadId || !departureTime || !seatLimit || !price) {
      return res.status(400).json({
        error: 'Required fields: departureDay, startHelipadId, stopHelipadId, departureTime, seatLimit, price'
      });
    }

    // Validate day
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(departureDay)) {
      return res.status(400).json({ error: 'Invalid departure day' });
    }

    // Check for duplicate schedule
    const existingSchedule = await JoyRideSchedule.findOne({
      where: {
        departure_day: departureDay,
        start_helipad_id: startHelipadId,
        stop_helipad_id: stopHelipadId,
        departure_time: departureTime
      }
    });

    if (existingSchedule) {
      return res.status(400).json({
        error: `A schedule already exists for ${departureDay} at ${departureTime} with the same route`
      });
    }

    // Create schedule
    const schedule = await JoyRideSchedule.create({
      departure_day: departureDay,
      start_helipad_id: startHelipadId,
      stop_helipad_id: stopHelipadId,
      departure_time: departureTime,
      arrival_time: arrivalTime || null,
      seat_limit: seatLimit,
      price: price,
      status: status !== undefined ? status : 1
    });

    res.status(201).json({
      message: 'Joy ride schedule created successfully',
      schedule
    });
  } catch (err) {
    console.error('Create joy ride schedule error:', err);
    res.status(500).json({ error: 'Failed to create joy ride schedule: ' + err.message });
  }
};

// Update a joy ride schedule
const updateJoyRideSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const schedule = await JoyRideSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Joy ride schedule not found' });
    }

    // If updating day/time/route, check for conflicts
    if (updates.departureDay || updates.departureTime || updates.startHelipadId || updates.stopHelipadId) {
      const conflictWhere = {
        id: { [Op.ne]: id },
        departure_day: updates.departureDay || schedule.departure_day,
        start_helipad_id: updates.startHelipadId || schedule.start_helipad_id,
        stop_helipad_id: updates.stopHelipadId || schedule.stop_helipad_id,
        departure_time: updates.departureTime || schedule.departure_time
      };

      const conflictingSchedule = await JoyRideSchedule.findOne({ where: conflictWhere });
      if (conflictingSchedule) {
        return res.status(400).json({
          error: 'A schedule with these details already exists'
        });
      }
    }

    await schedule.update(updates);

    res.json({
      message: 'Joy ride schedule updated successfully',
      schedule
    });
  } catch (err) {
    console.error('Update joy ride schedule error:', err);
    res.status(500).json({ error: 'Failed to update joy ride schedule: ' + err.message });
  }
};

// Delete a joy ride schedule
const deleteJoyRideSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await JoyRideSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: 'Joy ride schedule not found' });
    }

    // TODO: Check if schedule has any future bookings
    // const bookingCount = await JoyRideBooking.count({
    //   where: { 
    //     schedule_id: id,
    //     booking_date: { [Op.gte]: new Date() }
    //   }
    // });
    // if (bookingCount > 0) {
    //   return res.status(400).json({
    //     error: `Cannot delete schedule with ${bookingCount} future booking(s)`
    //   });
    // }

    await schedule.destroy();

    res.json({ message: 'Joy ride schedule deleted successfully' });
  } catch (err) {
    console.error('Delete joy ride schedule error:', err);
    res.status(500).json({ error: 'Failed to delete joy ride schedule: ' + err.message });
  }
};

module.exports = {
  getJoyRideSchedules,
  createJoyRideSchedule,
  updateJoyRideSchedule,
  deleteJoyRideSchedule
};
