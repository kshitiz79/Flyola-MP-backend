const { isValid: isValidDate, eachDayOfInterval, parseISO } = require('date-fns');
const models = require('./../model'); // Import the models object

// Validate date and time formats
const validateDateTime = (date, time) => {
  if (!isValidDate(parseISO(date))) {
    return false;
  }
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm format
  return timeRegex.test(time);
};

// Get all joyride slots, optionally filtered by date
const getJoyrideSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const where = date ? { date } : {};
    const slots = await models.Joy_Ride_Slot.findAll({ where });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed: ' + err.message });
  }
};

// Add new joyride slots for a date range
const addJoyrideSlot = async (req, res) => {
  const { startDate, endDate, time, seats, price, startHelipadId, stopHelipadId } = req.body;

  // Validate inputs
  if (!startDate || !endDate || !time || seats < 0 || price < 0) {
    return res.status(400).json({ error: 'startDate, endDate, time, seats, and price are required, and seats/price must be non-negative' });
  }

  // Validate helipad IDs
  if (!startHelipadId || !stopHelipadId) {
    return res.status(400).json({ error: 'startHelipadId and stopHelipadId are required' });
  }

  // Validate date and time formats
  if (!validateDateTime(startDate, time) || !validateDateTime(endDate, time)) {
    return res.status(400).json({ error: `Invalid startDate (${startDate}), endDate (${endDate}), or time (${time}). Ensure dates are valid (YYYY-MM-DD) and time is in HH:mm format.` });
  }

  // Ensure startDate is not after endDate
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (start > end) {
    return res.status(400).json({ error: 'startDate must not be after endDate' });
  }

  try {
    // Generate all dates in the range (inclusive)
    const dates = eachDayOfInterval({ start, end }).map(date => date.toISOString().split('T')[0]);

    // Check for existing slots with same date and time
    const existingSlots = await models.Joy_Ride_Slot.findAll({
      where: {
        date: dates,
        time,
      },
    });

    if (existingSlots.length > 0) {
      const conflictingDates = existingSlots.map(slot => slot.date).join(', ');
      return res.status(400).json({ error: `Slots already exist for dates: ${conflictingDates} at time ${time}` });
    }

    // Create slots in a transaction
    const slots = await models.sequelize.transaction(async (t) => {
      const createdSlots = await Promise.all(
        dates.map(date =>
          models.Joy_Ride_Slot.create(
            { 
              date, 
              time, 
              seats, 
              price,
              start_helipad_id: startHelipadId,
              stop_helipad_id: stopHelipadId
            },
            { transaction: t }
          )
        )
      );
      return createdSlots;
    });

    res.status(201).json({
      message: `Successfully created ${slots.length} joyride slots`,
      slots,
    });
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: 'Validation error: ' + err.message });
    }
    res.status(500).json({ error: 'Failed to add joyride slots: ' + err.message });
  }
};

// Update an existing joyride slot
const updateJoyrideSlot = async (req, res) => {
  const slotId = req.params.id;
  const { date, time, seats, price, startHelipadId, stopHelipadId } = req.body;
  
  // Validate slot ID
  if (!slotId || isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slot ID provided' });
  }
  
  // Validate input data
  if (!date || !time || seats < 0 || price < 0 || !validateDateTime(date, time)) {
    return res.status(400).json({ error: 'Invalid date, time, seats, or price. Ensure date is valid and time is in HH:mm format.' });
  }

  // Validate helipad IDs if provided
  if (startHelipadId && !Number.isInteger(parseInt(startHelipadId))) {
    return res.status(400).json({ error: 'Invalid startHelipadId' });
  }
  if (stopHelipadId && !Number.isInteger(parseInt(stopHelipadId))) {
    return res.status(400).json({ error: 'Invalid stopHelipadId' });
  }
  
  try {
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    
    if (!slot) {
      return res.status(404).json({ error: 'Joyride slot not found' });
    }
    
    
    // Check for conflicts with other slots (excluding current slot)
    const conflictingSlot = await models.Joy_Ride_Slot.findOne({
      where: {
        date,
        time,
        id: { [models.Sequelize.Op.ne]: slotId } // Exclude current slot
      }
    });
    
    if (conflictingSlot) {
      return res.status(400).json({ 
        error: `A slot already exists for ${date} at ${time}. Please choose a different date or time.` 
      });
    }
    
    // Update slot
    slot.date = date;
    slot.time = time;
    slot.seats = seats;
    slot.price = price;
    if (startHelipadId) slot.start_helipad_id = startHelipadId;
    if (stopHelipadId) slot.stop_helipad_id = stopHelipadId;
    await slot.save();
    
    res.json({ message: 'Joyride slot updated successfully', slot });
  } catch (err) {
    
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: 'Validation error: ' + err.message });
    }
    res.status(500).json({ 
      error: 'Failed to update joyride slot: ' + err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Delete a joyride slot
const deleteJoyrideSlot = async (req, res) => {
  const slotId = req.params.id;
  
  // Validate slot ID
  if (!slotId || isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slot ID provided' });
  }
  
  try {
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    
    if (!slot) {
      return res.status(404).json({ error: 'Joyride slot not found' });
    }
    
    
    // Check if slot has any bookings
    const bookingCount = await models.JoyRideBooking.count({
      where: { slot_id: slotId }
    });
    
    if (bookingCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete slot with ${bookingCount} existing booking(s). Cancel bookings first.` 
      });
    }
    
    await slot.destroy();
    res.json({ message: 'Joyride slot deleted successfully', deletedSlot: slot });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to delete joyride slot: ' + err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

module.exports = {
  getJoyrideSlots,
  addJoyrideSlot,
  updateJoyrideSlot,
  deleteJoyrideSlot,
};