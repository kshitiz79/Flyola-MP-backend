// src/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const getModels = () => require('../model');
require('dotenv').config();
const { authenticate } = require('../middleware/auth');

const { body, validationResult } = require('express-validator'); 
const { buildCookieOptions } = require('../utils/cookie');


const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'kshitizmaurya6@gmail.com',
    pass: 'augs snhv vjmw njfg',
  },
});

// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


router.post('/login', async (req, res) => {
  const models = getModels();
  const { email, password } = req.body;
  console.log('[Login] Request:', { email });

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: Number(user.role),
      remember_token: user.remember_token || null
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, role: Number(user.role) }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const models = getModels();

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOtp();
    user.remember_token = otp;
    await user.save();

    const mailOptions = {
      from: 'flyola@gmail.com',
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    return res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('[Forgot Password Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const models = getModels();

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.remember_token !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.remember_token = null; // Clear OTP after use
    await user.save();

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    return res.status(400).json({ error: 'Invalid OTP or server error' });
  }
});

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
})
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
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/',
  });
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
      user: { id: newUser.id, email, role: 3 },
      token // Include token in response body for frontend
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
      user: { id: newUser.id, email, role: 1 },
      token // Include token in response body for frontend
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



router.post(
  '/auth',
  [
    body('identifier')
      .notEmpty()
      .withMessage('Email or number is required')
      .custom((value) => {
        const isEmail = /\S+@\S+\.\S+/.test(value);
        const isPhone = /^\d{10}$/.test(value);
        if (!isEmail && !isPhone) {
          throw new Error('Invalid email or phone number format');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const models = getModels();
    const { identifier } = req.body;

    try {
      let user = await models.User.findOne({
        where: {
          [models.Sequelize.Op.or]: [
            { email: identifier },
            { number: identifier },
          ],
        },
      });

      if (user) {
        const payload = {
          id: user.id,
          email: user.email,
          role: Number(user.role),
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        return res.json({
          message: 'Login successful',
          token,
          user: { id: user.id, email: user.email, role: Number(user.role) },
        });
      } else {
        const isEmail = /\S+@\S+\.\S+/.test(identifier);
        const userData = {
          email: isEmail ? identifier : null, // Set email to identifier or null
          number: !isEmail ? identifier : null, // Set number to identifier or null
          name: 'Unknown',
          password: 'no_password',
          role: 3,
        };

        user = await models.User.create(userData);
        const payload = {
          id: user.id,
          email: user.email,
          role: Number(user.role),
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        return res.status(201).json({
          message: 'User created and logged in successfully',
          token,
          user: { id: user.id, email: user.email, role: Number(user.role) },
        });
      }
    } catch (err) {
      console.error('[Auth Error]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);




router.get('/profile', authenticate(), async (req, res) => {
  const models = getModels();
  try {
    const user = await models.User.findByPk(req.user.id, {
      attributes: [
        'id',
        'name',
        'dob',
        'gender',
        'marital_status',
        'anniversary_date',
        'nationality',
        'city',
        'state',
        'profile_picture',
        'pan_card_number',
        'email',
        'number',
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ profile: user });
  } catch (err) {
    console.error('[GET Profile Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});



router.post('/profile', authenticate(), async (req, res) => {
  const models = getModels();
  const {
    name,
    dob,
    gender,
    marital_status,
    anniversary_date,
    nationality,
    city,
    state,
    profile_picture,
    pan_card_number,
    email,
    number,
  } = req.body;

  try {
    const user = await models.User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update only fields if provided
    if (name !== undefined) user.name = name;
    if (dob !== undefined) user.dob = dob;
    if (gender !== undefined) user.gender = gender;
    if (marital_status !== undefined) user.marital_status = marital_status;
    if (anniversary_date !== undefined) user.anniversary_date = anniversary_date;
    if (nationality !== undefined) user.nationality = nationality;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (profile_picture !== undefined) user.profile_picture = profile_picture;
    if (pan_card_number !== undefined) user.pan_card_number = pan_card_number;
    if (email !== undefined) user.email = email;
    if (number !== undefined) user.number = number;

    await user.save();

    return res.json({ message: 'Profile updated successfully', profile: user });
  } catch (err) {
    console.error('[POST Profile Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});
