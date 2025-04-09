// src/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./../../db'); // Adjust path as needed
require('dotenv').config();

const router = express.Router();





router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: Number(user.role), email: user.email, remember_token: user.remember_token || null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
    });
    res.json({ token, role: Number(user.role), message: 'Login successful' });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Registration route for regular users
router.post('/register', async (req, res) => {
  const { name, email, password, number } = req.body;
  
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  try {
    const [results] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const query = 'INSERT INTO users (name, email, password, number) VALUES (?, ?, ?, ?)';
    const [result] = await pool.query(query, [name, email, hashedPassword, number]);
    
    const token = jwt.sign(
      { id: result.insertId, email, role: 3, remember_token: null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.status(201).json({ message: 'User registered successfully', token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin registration route
router.post('/register-admin', async (req, res) => {
  const { name, email, password, number } = req.body;
  
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  try {
    const [results] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const adminToken = 'admin_default_token'; // Ensure admin tokens are non-null
    
    const query = 'INSERT INTO users (name, email, password, number, role, remember_token) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [name, email, hashedPassword, number, 1, adminToken]);
    
    const token = jwt.sign(
      { id: result.insertId, email, role: 1, remember_token: adminToken },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.status(201).json({ message: 'Admin registered successfully', token });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});










// (Optional) Registration route if needed;

router.get('/', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users');
    res.json(users);
  } catch (err) {
    console.error('Error during fetching users:', err);
    res.status(500).json({ error: 'Server error' });
  }
})


// Admin registration route



module.exports = router;


// Login Route - POST /users/login



