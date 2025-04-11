require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'flyolanew',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    logging: false,
  }
);

sequelize.authenticate()
  .then(() => console.log('Database connected successfully'))
  .catch((err) => console.error('Unable to connect to the database:', err));

module.exports = sequelize;