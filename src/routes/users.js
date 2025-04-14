const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const getModels = () => require('../model'); // Lazy-load models
require('dotenv').config();

const router = express.Router();

router.post('/login', async (req, res) => {
  const models = getModels();
  const { email, password, rememberMe } = req.body;
  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    // Set token expiry based on rememberMe flag
    const tokenExpiry = rememberMe ? '7d' : '1h';
    const cookieExpiry = rememberMe ? 604800000 : 3600000; // 7 days vs 1 hour (in milliseconds)

    const token = jwt.sign(
      { id: user.id, role: Number(user.role), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    // Send token in an HTTP‑only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieExpiry,
    });
    res.json({ token, role: Number(user.role), message: 'Login successful' });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// (Optional) Refresh token endpoint – useful if you decide to implement a refresh token strategy.
router.post('/refresh-token', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);
    
    const newToken = jwt.sign(
      { id: decoded.id, role: decoded.role, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Issue a new short‑lived token (adjust as needed)
    );
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
    });
    res.json({ token: newToken });
  });
});

router.post('/register', async (req, res) => {
  const models = getModels();
  const { name, email, password, number } = req.body;
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await models.User.create({
      name,
      email,
      password: hashedPassword,
      number,
      role: 3, // Default user role
    });

    const token = jwt.sign(
      { id: newUser.id, email, role: 3 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.status(201).json({ message: 'User registered successfully', token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/register-admin', async (req, res) => {
  const models = getModels();
  const { name, email, password, number } = req.body;
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const adminToken = 'admin_default_token';
    const newUser = await models.User.create({
      name,
      email,
      password: hashedPassword,
      number,
      role: 1, // Admin role
      remember_token: adminToken,
    });

    const token = jwt.sign(
      { id: newUser.id, email, role: 1, remember_token: adminToken },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.status(201).json({ message: 'Admin registered successfully', token });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  const models = getModels();
  try {
    const users = await models.User.findAll();
    res.json(users);
  } catch (err) {
    console.error('Error during fetching users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
