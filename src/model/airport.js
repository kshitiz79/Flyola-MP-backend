const pool = require('../../db'); // Your MySQL connection pool

// Get all airports
const getAllAirports = async () => {
  try {
    const [rows] = await pool.query('SELECT * FROM airports'); // Use promise-based query
    return rows;  // Return the rows from the query
  } catch (err) {
    throw err;  // Rethrow the error to be handled by the controller
  }
};

// Add a new airport
const addAirport = async (airportData) => {
  try {
    const result = await pool.query('INSERT INTO airports SET ?', [airportData]);  // Use promise-based query
    return result[0].insertId;  // Return the inserted airport ID
  } catch (err) {
    throw err;  // Rethrow the error to be handled by the controller
  }
};

// Update an existing airport
const updateAirport = async (id, airportData) => {
  try {
    const result = await pool.query('UPDATE airports SET ? WHERE id = ?', [airportData, id]);
    return result[0];  // Return the result of the update query
  } catch (err) {
    throw err;  // Rethrow the error to be handled by the controller
  }
};

// Delete an airport
const deleteAirport = async (id) => {
  try {
    const result = await pool.query('DELETE FROM airports WHERE id = ?', [id]);
    return result[0];  // Return the result of the delete query
  } catch (err) {
    throw err;  // Rethrow the error to be handled by the controller
  }
};

module.exports = {
  getAllAirports,
  addAirport,
  updateAirport,
  deleteAirport
};
