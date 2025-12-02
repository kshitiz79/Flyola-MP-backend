const models = require('./../model');

const getAirports = async (req, res) => {
  try {
    const where = req.query.user === 'true' ? { status: 1 } : {};
    const airports = await models.Airport.findAll({ where });
    res.json(airports);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
};

const addAirport = async (req, res) => {
  const { 
    city, 
    airport_code, 
    airport_name, 
    status = 1
  } = req.body;
  
  // Validate required fields
  if (!city) {
    return res.status(400).json({ error: 'City is required' });
  }
  
  if (!airport_code || !airport_name) {
    return res.status(400).json({ error: 'Airport code and name are required' });
  }
  
  if (![0, 1].includes(Number(status))) {
    return res.status(400).json({ error: 'Status must be 0 or 1' });
  }
  
  try {
    const airport = await models.Airport.create({
      city, 
      airport_code,
      airport_name,
      status
    });
    
    res.status(201).json({
      message: 'Airport added successfully',
      airport,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add airport', details: err.message });
  }
};

const updateAirport = async (req, res) => {
  const airportId = req.params.id;
  const { 
    city, 
    airport_code, 
    airport_name, 
    status
  } = req.body;
  
  // Validate required fields
  if (!city) {
    return res.status(400).json({ error: 'City is required' });
  }
  
  if (!airport_code || !airport_name) {
    return res.status(400).json({ error: 'Airport code and name are required' });
  }
  
  if (status !== undefined && ![0, 1].includes(Number(status))) {
    return res.status(400).json({ error: 'Status must be 0 or 1' });
  }
  
  try {
    const airport = await models.Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Airport not found' });
    }
    
    await airport.update({ 
      city, 
      airport_code,
      airport_name,
      status: status ?? airport.status
    });
    
    res.json({ message: 'Airport updated successfully', airport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update airport', details: err.message });
  }
};

const deleteAirport = async (req, res) => {
  const airportId = req.params.id;
  try {
    const airport = await models.Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Airport not found' });
    }
    await airport.destroy();
    res.json({ message: 'Airport deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete airport', details: err.message });
  }
};

const activateAllAirports = async (req, res) => {
  try {
    await models.Airport.update({ status: 1 }, { where: {} });
    res.json({ message: 'All airports activated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate all airports', details: err.message });
  }
};

const editAllAirports = async (req, res) => {
  const { city, airport_code, airport_name } = req.body;
  if (!city && !airport_code && !airport_name) {
    return res.status(400).json({ error: 'At least one field (city, airport_code, airport_name) must be provided' });
  }
  try {
    const updates = {};
    if (city) updates.city = city;
    if (airport_code) updates.airport_code = airport_code;
    if (airport_name) updates.airport_name = airport_name;
    await models.Airport.update(updates, { where: {} });
    res.json({ message: 'All airports updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update all airports', details: err.message });
  }
};

const deleteAllAirports = async (req, res) => {
  try {
    await models.Airport.destroy({ where: {} });
    res.json({ message: 'All airports deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete all airports', details: err.message });
  }
};








module.exports = {
  getAirports,
  addAirport,
  updateAirport,
  deleteAirport,
  activateAllAirports,
  editAllAirports,
  deleteAllAirports,
};