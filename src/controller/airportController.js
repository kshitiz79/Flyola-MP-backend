const models = require('./../model'); // Import the models object

// Get all airports
const getAirports = async (req, res) => {
  try {
    const airports = await models.Airport.findAll();
    res.json(airports);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
};

// Add a new airport
const addAirport = async (req, res) => {
  const { city, airport_code, airport_name } = req.body;
  if (!city || !airport_code || !airport_name) {
    return res.status(400).json({ error: 'City, airport code, and airport name are required' });
  }
  try {
    const airport = await models.Airport.create({ city, airport_code, airport_name });
    res.status(201).json({
      message: 'Airport added successfully',
      airport: airport,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add airport' });
  }
};

// Update an existing airport
const updateAirport = async (req, res) => {
  const airportId = req.params.id;
  const { city, airport_code, airport_name } = req.body;
  if (!city || !airport_code || !airport_name) {
    return res.status(400).json({ error: 'City, airport code, and airport name are required' });
  }
  try {
    const airport = await models.Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Airport not found' });
    }
    airport.city = city;
    airport.airport_code = airport_code;
    airport.airport_name = airport_name;
    await airport.save();
    res.json({ message: 'Airport updated successfully', airport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update airport' });
  }
};

// Delete an airport
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
    res.status(500).json({ error: 'Failed to delete airport' });
  }
};

module.exports = {
  getAirports,
  addAirport,
  updateAirport,
  deleteAirport,
};