const airportModel = require('../model/airport');

// Get all airports
const getAirports = async (req, res) => {
  try {
    const airports = await airportModel.getAllAirports(); // Use async/await here
    res.json(airports);  // Send the airports data as a response
  } catch (err) {
    console.error('Error during fetching airports:', err);
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
    const airportData = { city, airport_code, airport_name };
    const airportId = await airportModel.addAirport(airportData);  // Use async/await here
    res.status(201).json({ message: 'Airport added successfully', id: airportId });
  } catch (err) {
    console.error('Error during adding airport:', err);
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
    const airportData = { city, airport_code, airport_name };
    await airportModel.updateAirport(airportId, airportData);  // Use async/await here
    res.json({ message: 'Airport updated successfully' });
  } catch (err) {
    console.error('Error during updating airport:', err);
    res.status(500).json({ error: 'Failed to update airport' });
  }
};

// Delete an airport
const deleteAirport = async (req, res) => {
  const airportId = req.params.id;

  try {
    await airportModel.deleteAirport(airportId);  // Use async/await here
    res.json({ message: 'Airport deleted successfully' });
  } catch (err) {
    console.error('Error during deleting airport:', err);
    res.status(500).json({ error: 'Failed to delete airport' });
  }
};

module.exports = {
  getAirports,
  addAirport,
  updateAirport,
  deleteAirport
};
