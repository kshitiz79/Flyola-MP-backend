const models = require('./../model'); // Import the models object

// Get all joyride slots, optionally filtered by date
const getJoyrideSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const where = date ? { date } : {};
    const slots = await models.Joy_Ride_Slot.findAll({ where });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Add a new joyride slot
const addJoyrideSlot = async (req, res) => {
  const { date, time, seats, price } = req.body;
  if (!date || !time || seats < 0 || price < 0) {
    return res.status(400).json({ error: 'Date, time, seats, and price are required, and seats and price must be non-negative' });
  }
  try {
    const slot = await models.Joy_Ride_Slot.create({ date, time, seats, price });
    res.status(201).json({
      message: 'Joyride slot added successfully',
      slot,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add joyride slot' });
  }
};

// Update an existing joyride slot
const updateJoyrideSlot = async (req, res) => {
  const slotId = req.params.id;
  const { date, time, seats, price } = req.body;
  if (!date || !time || seats < 0 || price < 0) {
    return res.status(400).json({ error: 'Date, time, seats, and price are required, and seats and price must be non-negative' });
  }
  try {
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Joyride slot not found' });
    }
    slot.date = date;
    slot.time = time;
    slot.seats = seats;
    slot.price = price;
    await slot.save();
    res.json({ message: 'Joyride slot updated successfully', slot });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update joyride slot' });
  }
};

// Delete a joyride slot
const deleteJoyrideSlot = async (req, res) => {
  const slotId = req.params.id;
  try {
    const slot = await models.Joy_Ride_Slot.findByPk(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Joyride slot not found' });
    }
    await slot.destroy();
    res.json({ message: 'Joyride slot deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete joyride slot' });
  }
};

module.exports = {
  getJoyrideSlots,
  addJoyrideSlot,
  updateJoyrideSlot,
  deleteJoyrideSlot,
};