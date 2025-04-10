// db.js
require('dotenv').config();
const { Sequelize } = require('sequelize');

// Create a new Sequelize instance (connection to MySQL)
const sequelize = new Sequelize(
  process.env.DB_NAME || 'flyolanew', // Database name
  process.env.DB_USER || 'root', // Database username
  process.env.DB_PASSWORD || '', // Database password
  {
    host: process.env.DB_HOST || 'localhost', // Database host
    dialect: 'mysql', // Dialect
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    logging: false, // Disable SQL logging
  }
);

// Test the connection
sequelize.authenticate()
  .then(() => console.log('Database connected successfully'))
  .catch((err) => console.error('Unable to connect to the database:', err));

module.exports = sequelize;
