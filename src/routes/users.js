const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const getModels = () => require('../model'); // Lazy-load models
require('dotenv').config();

const router = express.Router();

router.post('/login', async (req, res) => {
  const models = getModels();
  const { email, password } = req.body;
  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

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

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
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
      { id: newUser.id, email, role: 3, remember_token: null },
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