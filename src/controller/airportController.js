// controllers/airportController.js
const Airport = require('./../model/airport');

// Get all airports
const getAirports = async (req, res) => {
  try {
    const airports = await Airport.findAll(); // Sequelize method to fetch all airports
    res.json(airports); // Send the airports data as a response
  } catch (err) {
    console.error('Error fetching airports:', err);
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
    const airport = await Airport.create({ city, airport_code, airport_name });
    res.status(201).json({
      message: 'Airport added successfully',
      airport: airport,
    });
  } catch (err) {
    console.error('Error adding airport:', err);
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
    const airport = await Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Airport not found' });
    }

    // Update the airport details
    airport.city = city;
    airport.airport_code = airport_code;
    airport.airport_name = airport_name;

    await airport.save(); // Save the updated airport
    res.json({ message: 'Airport updated successfully', airport });
  } catch (err) {
    console.error('Error updating airport:', err);
    res.status(500).json({ error: 'Failed to update airport' });
  }
};

// Delete an airport
const deleteAirport = async (req, res) => {
  const airportId = req.params.id;

  try {
    const airport = await Airport.findByPk(airportId);
    if (!airport) {
      return res.status(404).json({ message: 'Airport not found' });
    }

    await airport.destroy(); // Delete the airport from the database
    res.json({ message: 'Airport deleted successfully' });
  } catch (err) {
    console.error('Error deleting airport:', err);
    res.status(500).json({ error: 'Failed to delete airport' });
  }
};

module.exports = {
  getAirports,
  addAirport,
  updateAirport,
  deleteAirport,
};
