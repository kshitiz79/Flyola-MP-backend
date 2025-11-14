require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME || 'flyola',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '', {
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

module.exports = sequelize;






// DB_USER=root
// DB_PASSWORD=Flyola_mysql_pass_123456
// DB_NAME=mydatabase_name_dev
// JWT_SECRET=dhjwbkhnlmjnwdehbk
