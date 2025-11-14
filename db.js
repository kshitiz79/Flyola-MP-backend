require('dotenv').config(); // Add this at the top

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flyolanew',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;





// GNU nano 7.2                                                                     db.js                                                                              require('dotenv').config(); // Add this at the top

// const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME || 'my_database_name',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

// module.exports = pool;



// GNU nano 7.2                                                                      .env                                                                              JWT_SECRET=dhjwbkhnlmjnwdehbk
// NEXT_PUBLIC_API_URL=http://localhost:4000  



// DB_HOST=127.0.0.1
// DB_USER=root
// DB_PASSWORD=Flyola@123456
// DB_NAME=my_database_name
