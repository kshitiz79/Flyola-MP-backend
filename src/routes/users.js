// src/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const getModels = () => require('../model');
require('dotenv').config();
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper to build cookie options
const buildCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 3600000, // 1 hour
    path: '/',
  };
  if (isProd) {
    // set your real domain here, with leading dot if needed
    opts.domain = '.yourdomain.com';
  }
  return opts;
};

/** Login **/
router.post('/login', async (req, res) => {
  const models = getModels();
  const { email, password } = req.body;
  console.log('[Login] Request:', { email });

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      console.log('[Login] User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('[Login] Password mismatch:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: Number(user.role),
      remember_token: user.remember_token || null
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('token', token, buildCookieOptions());
    console.log('[Login] Token set for user:', { email, role: user.role });

    return res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, role: Number(user.role) }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Refresh Token **/
router.post('/refresh-token', async (req, res) => {
  const models = getModels();
  const oldToken = req.cookies.token;
  if (!oldToken) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(oldToken, process.env.JWT_SECRET, { ignoreExpiration: true });
    const user = await models.User.findOne({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: Number(user.role),
      remember_token: user.remember_token || null
    };
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('token', newToken, buildCookieOptions());
    return res.json({
      message: 'Token refreshed',
      user: { id: user.id, email: user.email, role: Number(user.role) }
    });
  } catch (err) {
    console.error('[Refresh Token Error]', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/** Logout **/
router.post('/logout', (req, res) => {
  res.clearCookie('token', buildCookieOptions());
  return res.json({ message: 'Logged out successfully' });
});

/** Register (User) **/
router.post('/register', async (req, res) => {
  const models = getModels();
  const { name, email, password, number } = req.body;
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const exists = await models.User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const newUser = await models.User.create({
      name, email, password: hashed, number, role: 3
    });

    const payload = { id: newUser.id, email, role: 3, remember_token: null };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('token', token, buildCookieOptions());
    return res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser.id, email, role: 3 }
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Register Admin **/
router.post('/register-admin', async (req, res) => {
  const models = getModels();
  const { name, email, password, number } = req.body;
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const exists = await models.User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const remember_token = 'admin_default_token';
    const newUser = await models.User.create({
      name, email, password: hashed, number, role: 1, remember_token
    });

    const payload = { id: newUser.id, email, role: 1, remember_token };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('token', token, buildCookieOptions());
    return res.status(201).json({
      message: 'Admin registered successfully',
      user: { id: newUser.id, email, role: 1 }
    });
  } catch (err) {
    console.error('[Register Admin Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Fetch All Users **/
router.get('/', async (req, res) => {
  const models = getModels();
  try {
    const users = await models.User.findAll();
    return res.json(users);
  } catch (err) {
    console.error('[Fetch Users Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Forgot Password **/
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const models = getModels();

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resetToken = jwt.sign(
      { id: user.id, email: user.email, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const resetLink = `${process.env.APP_CLIENT_URL}/reset-password?token=${resetToken}`;

    const { sendResetPasswordEmail } = require('../utils/mailer');
    await sendResetPasswordEmail(user.email, resetLink);

    return res.json({ message: 'Password reset email sent' });
  } catch (err) {
    console.error('[Forgot Password Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Reset Password **/
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  const models = getModels();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    const user = await models.User.findOne({ where: { id: decoded.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('[Reset Password Error]', err);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

/** Verify Logged-In User **/
router.get('/verify', authenticate(), (req, res) => {
  console.log('[Verify] User verified:', req.user);
  return res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role
  });
});

module.exports = router;
