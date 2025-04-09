// db.js
const mysql = require('mysql2/promise'); // Use the promise-based version of mysql2

// Create a connection pool (recommended for production)
const pool = mysql.createPool({
  host: 'localhost',   // replace with your host, e.g., process.env.DB_HOST
  user: 'root',   // replace with your MySQL username
  password: 'Ks@1234_Aa', // replace with your MySQL password
  database: 'flyola', // replace with your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Export the pool to use in your routes or other modules
module.exports = pool;
