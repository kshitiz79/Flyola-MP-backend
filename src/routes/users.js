const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const getModels = () => require('../model'); // Lazy-load models
require('dotenv').config();

const router = express.Router();

/** Login Route **/
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

    // Optionally remove httpOnly if you need client-side access for quick redirection.
    res.cookie('token', token, {
      // httpOnly: true, // Uncomment for security if you use a secure token lookup endpoint instead of localStorage
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
    });
    
    // Send token and role in JSON response for client-side usage
    res.json({ token, role: Number(user.role), message: 'Login successful' });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Logout Route **/
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

/** Register Route **/
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

/** Register Admin Route **/
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

/** Fetch All Users **/
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

/** Forgot Password Route **/
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const models = getModels();
  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const resetToken = jwt.sign(
      { id: user.id, email: user.email, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const resetLink = `${process.env.APP_CLIENT_URL}/reset-password?token=${resetToken}`;
    const { sendResetPasswordEmail } = require('./../utils/mailer');
    await sendResetPasswordEmail(user.email, resetLink);

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Reset Password Route **/
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }

    const models = getModels();
    const user = await models.User.findOne({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(400).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
