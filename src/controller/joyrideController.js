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
  const { startDate, endDate, time, seats, price } = req.body;

  // Validate inputs
  if (!startDate || !endDate || !time || seats < 0 || price < 0) {
    return res.status(400).json({ error: 'startDate, endDate, time, seats, and price are required, and seats/price must be non-negative' });
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
            { date, time, seats, price },
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
  const { date, time, seats, price } = req.body;
  console.log('[UPDATE Joy Ride Slot] Request for slot ID:', slotId, 'with data:', { date, time, seats, price }, 'by user:', req.user);
  
  // Validate slot ID
  if (!slotId || isNaN(slotId)) {
    console.log('[UPDATE Joy Ride Slot] Invalid slot ID:', slotId);
    return res.status(400).json({ error: 'Invalid slot ID provided' });
  }
  
  // Validate input data
  if (!date || !time || seats < 0 || price < 0 || !validateDateTime(date, time)) {
    console.log('[UPDATE Joy Ride Slot] Invalid input data:', { date, time, seats, price });
    return res.status(400).json({ error: 'Invalid date, time, seats, or price. Ensure date is valid and time is in HH:mm format.' });
  }
  
  try {
    console.log('[UPDATE Joy Ride Slot] Looking for slot with ID:', slotId);
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    
    if (!slot) {
      console.log('[UPDATE Joy Ride Slot] Slot not found with ID:', slotId);
      return res.status(404).json({ error: 'Joyride slot not found' });
    }
    
    console.log('[UPDATE Joy Ride Slot] Found slot:', slot.toJSON());
    
    // Check for conflicts with other slots (excluding current slot)
    const conflictingSlot = await models.Joy_Ride_Slot.findOne({
      where: {
        date,
        time,
        id: { [models.Sequelize.Op.ne]: slotId } // Exclude current slot
      }
    });
    
    if (conflictingSlot) {
      console.log('[UPDATE Joy Ride Slot] Conflicting slot found:', conflictingSlot.id);
      return res.status(400).json({ 
        error: `A slot already exists for ${date} at ${time}. Please choose a different date or time.` 
      });
    }
    
    // Update slot
    slot.date = date;
    slot.time = time;
    slot.seats = seats;
    slot.price = price;
    await slot.save();
    
    console.log('[UPDATE Joy Ride Slot] Successfully updated slot:', slotId);
    res.json({ message: 'Joyride slot updated successfully', slot });
  } catch (err) {
    console.error('[UPDATE Joy Ride Slot] Error:', err.message);
    console.error('[UPDATE Joy Ride Slot] Stack:', err.stack);
    
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
  console.log('[DELETE Joy Ride Slot] Request for slot ID:', slotId, 'by user:', req.user);
  
  // Validate slot ID
  if (!slotId || isNaN(slotId)) {
    console.log('[DELETE Joy Ride Slot] Invalid slot ID:', slotId);
    return res.status(400).json({ error: 'Invalid slot ID provided' });
  }
  
  try {
    console.log('[DELETE Joy Ride Slot] Looking for slot with ID:', slotId);
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    
    if (!slot) {
      console.log('[DELETE Joy Ride Slot] Slot not found with ID:', slotId);
      return res.status(404).json({ error: 'Joyride slot not found' });
    }
    
    console.log('[DELETE Joy Ride Slot] Found slot:', slot.toJSON());
    
    // Check if slot has any bookings
    const bookingCount = await models.JoyRideBooking.count({
      where: { slot_id: slotId }
    });
    
    if (bookingCount > 0) {
      console.log('[DELETE Joy Ride Slot] Cannot delete slot with bookings:', bookingCount);
      return res.status(400).json({ 
        error: `Cannot delete slot with ${bookingCount} existing booking(s). Cancel bookings first.` 
      });
    }
    
    await slot.destroy();
    console.log('[DELETE Joy Ride Slot] Successfully deleted slot:', slotId);
    res.json({ message: 'Joyride slot deleted successfully', deletedSlot: slot });
  } catch (err) {
    console.error('[DELETE Joy Ride Slot] Error:', err.message);
    console.error('[DELETE Joy Ride Slot] Stack:', err.stack);
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