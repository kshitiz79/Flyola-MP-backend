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
    status = 1, 
    has_helipad = false, 
    helipad_code, 
    helipad_name 
  } = req.body;
  
  // City is always required
  if (!city) {
    return res.status(400).json({ error: 'City is required' });
  }
  
  // For helipad-only locations, helipad code and name are required
  // For airport locations, airport code and name are required
  if (has_helipad && (!helipad_code || !helipad_name)) {
    return res.status(400).json({ error: 'Helipad code and name are required when has_helipad is true' });
  }
  
  // If not helipad-only, airport code and name are required
  if (!has_helipad && (!airport_code || !airport_name)) {
    return res.status(400).json({ error: 'Airport code and name are required for airport locations' });
  }
  
  // If has_helipad but also has airport_code, it's airport + helipad (both required)
  if (has_helipad && airport_code && !airport_name) {
    return res.status(400).json({ error: 'Airport name is required when airport code is provided' });
  }
  
  if (![0, 1].includes(Number(status))) {
    return res.status(400).json({ error: 'Status must be 0 or 1' });
  }
  
  try {
    const airportData = { 
      city, 
      status, 
      has_helipad: Boolean(has_helipad)
    };
    
    // Add airport data if provided
    if (airport_code) {
      airportData.airport_code = airport_code;
      airportData.airport_name = airport_name;
    }
    
    // Add helipad data if has_helipad is true
    if (has_helipad) {
      airportData.helipad_code = helipad_code;
      airportData.helipad_name = helipad_name;
    }
    
    const airport = await models.Airport.create(airportData);
    res.status(201).json({
      message: 'Location added successfully',
      airport,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add location', details: err.message });
  }
};

const updateAirport = async (req, res) => {
  const airportId = req.params.id;
  const { 
    city, 
    airport_code, 
    airport_name, 
    status, 
    has_helipad, 
    helipad_code, 
    helipad_name 
  } = req.body;
  
  // City is required
  if (!city) {
    return res.status(400).json({ error: 'City is required' });
  }
  
  if (status !== undefined && ![0, 1].includes(Number(status))) {
    return res.status(400).json({ error: 'Status must be 0 or 1' });
  }
  
  // Validate helipad data if has_helipad is true
  if (has_helipad && (!helipad_code || !helipad_name)) {
    return res.status(400).json({ error: 'Helipad code and name are required when has_helipad is true' });
  }
  
  // If not helipad-only, airport code and name are required
  if (!has_helipad && (!airport_code || !airport_name)) {
    return res.status(400).json({ error: 'Airport code and name are required for airport locations' });
  }
  
  try {
    const airport = await models.Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Location not found' });
    }
    
    const updateData = { 
      city, 
      status: status ?? airport.status,
      has_helipad: has_helipad !== undefined ? Boolean(has_helipad) : airport.has_helipad
    };
    
    // Update airport data if provided
    if (airport_code) {
      updateData.airport_code = airport_code;
      updateData.airport_name = airport_name;
    } else {
      // If no airport code provided, clear airport data (helipad-only)
      updateData.airport_code = null;
      updateData.airport_name = null;
    }
    
    // Update helipad data
    if (has_helipad) {
      updateData.helipad_code = helipad_code;
      updateData.helipad_name = helipad_name;
    } else if (has_helipad === false) {
      // Clear helipad data if has_helipad is set to false
      updateData.helipad_code = null;
      updateData.helipad_name = null;
    }
    
    await airport.update(updateData);
    res.json({ message: 'Location updated successfully', airport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location', details: err.message });
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