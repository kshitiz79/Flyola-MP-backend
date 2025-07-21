// src/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const models = require('../model');
require('dotenv').config();
const { authenticate } = require('../middleware/auth');

const { body, validationResult } = require('express-validator'); 
const { buildCookieOptions } = require('../utils/cookie');


const router = express.Router();

// Email configuration with better error handling
const createTransporter = () => {
  try {
    // Check if email credentials are available
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    
    if (!emailUser || !emailPass) {
      console.warn('[Email Config] Missing email credentials in environment variables');
      return null;
    }

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false
      },
      // Add timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  } catch (error) {
    console.error('[Email Transporter Error]', error);
    return null;
  }
};

// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('[Login] Request:', { email });

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      console.log('[Login] User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('[Login] Password mismatch for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: Number(user.role),
      remember_token: user.remember_token || null
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }); // Extended token life

    console.log('[Login] Success for:', email);
    return res.json({
      message: 'Login successful',
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        role: Number(user.role) 
      }
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Validate email format
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOtp();
    user.remember_token = otp;
    user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    await user.save();

    // Try to send email, but don't fail if email service is down
    try {
      const transporter = createTransporter();
      if (transporter) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Flyola - Password Reset OTP',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4F46E5;">Password Reset Request</h2>
              <p>Hello,</p>
              <p>You have requested to reset your password for your Flyola account.</p>
              <p>Your OTP for password reset is:</p>
              <div style="background-color: #F3F4F6; padding: 20px; text-align: center; margin: 20px 0;">
                <h1 style="color: #4F46E5; font-size: 32px; margin: 0;">${otp}</h1>
              </div>
              <p>This OTP is valid for 10 minutes only.</p>
              <p>If you didn't request this password reset, please ignore this email.</p>
              <p>Best regards,<br>Flyola Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log('[Email] OTP sent successfully to:', email);
        return res.json({ message: 'OTP sent to your email' });
      } else {
        // If email service fails, still return success but log the error
        console.error('[Email Service Unavailable] OTP generated but email not sent');
        return res.json({ 
          message: 'OTP generated. Email service temporarily unavailable.',
          otp: process.env.NODE_ENV === 'development' ? otp : undefined,
          debug: process.env.NODE_ENV === 'development' ? 'Email service not configured' : undefined
        });
      }
    } catch (emailError) {
      console.error('[Email Send Error]', emailError.message);
      // Return success but mention email issue
      return res.json({ 
        message: 'OTP generated. Email service temporarily unavailable.',
        otp: process.env.NODE_ENV === 'development' ? otp : undefined,
        debug: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
  } catch (err) {
    console.error('[Forgot Password Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Validate input
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  }

  // Validate password strength
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const user = await models.User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.remember_token !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check if OTP has expired (if otp_expires_at field exists)
    if (user.otp_expires_at && new Date() > user.otp_expires_at) {
      user.remember_token = null;
      user.otp_expires_at = null;
      await user.save();
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.remember_token = null; // Clear OTP after use
    user.otp_expires_at = null; // Clear expiration time
    await user.save();

    console.log('[Password Reset] Success for:', email);
    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Refresh Token **/
router.post('/refresh-token', async (req, res) => {
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
  const { name, email, password, number } = req.body;
  
  console.log('[Register] Request:', { name, email, number });
  
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Basic phone validation
  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(number)) {
    return res.status(400).json({ error: 'Phone number must be 10 digits' });
  }

  try {
    const exists = await models.User.findOne({ where: { email } });
    if (exists) {
      console.log('[Register] Email already exists:', email);
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const newUser = await models.User.create({
      name, 
      email, 
      password: hashed, 
      number, 
      role: 3
    });

    const payload = { 
      id: newUser.id, 
      email, 
      role: 3, 
      remember_token: null 
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.cookie('token', token, buildCookieOptions());
    console.log('[Register] Success for:', email);
    
    return res.status(201).json({
      message: 'User registered successfully',
      user: { 
        id: newUser.id, 
        name: newUser.name,
        email, 
        role: 3 
      },
      token
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Register Admin **/
router.post('/register-admin', async (req, res) => {
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

/** Test endpoint to check models **/
router.get('/test', async (req, res) => {
  try {
    console.log('[GET /users/test] Testing models...');
    console.log('[GET /users/test] Models available:', Object.keys(models));
    console.log('[GET /users/test] User model:', !!models.User);
    
    if (!models.User) {
      return res.status(500).json({ error: 'User model not found' });
    }
    
    const count = await models.User.count();
    console.log('[GET /users/test] User count:', count);
    
    return res.json({ 
      message: 'Models working correctly',
      userCount: count,
      availableModels: Object.keys(models)
    });
  } catch (err) {
    console.error('[GET /users/test] Error:', err.message);
    return res.status(500).json({ 
      error: 'Test failed', 
      details: err.message 
    });
  }
});

/** Fetch All Users **/
router.get('/all', authenticate(), async (req, res) => {
  console.log('[GET /users/all] Request received from user:', req.user);
  try {
    console.log('[GET /users/all] Attempting to fetch users...');
    const users = await models.User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'number', 'created_at']
    });
    console.log('[GET /users/all] Successfully fetched', users.length, 'users');
    return res.json(users);
  } catch (err) {
    console.error('[GET /users/all] Error:', err.message);
    console.error('[GET /users/all] Stack:', err.stack);
    return res.status(500).json({ 
      error: 'Server error', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

/** Reset Password **/
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

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







// src/routes/users.js

// Booking Agent Registration Route
router.post('/register-booking-agent', async (req, res) => {
  const { name, email, password, number } = req.body;
  
  // Check if required fields are provided
  if (!name || !email || !password || !number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    // Check if the email already exists
    const exists = await models.User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash the password before saving it
    const hashed = await bcrypt.hash(password, 12);

    // Create a new user with role set to '2' for booking agent
    const newUser = await models.User.create({
      name,
      email,
      password: hashed,
      number,
      role: 2  // Set the role to booking agent
    });

    // Prepare the JWT token payload
    const payload = { id: newUser.id, email, role: 2, remember_token: null };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Respond with the token and user information
    res.cookie('token', token, buildCookieOptions());
    return res.status(201).json({
      message: 'Booking agent registered successfully',
      user: { id: newUser.id, email, role: 2 },
      token  // Include the token in the response for frontend use
    });
  } catch (err) {
    console.error('[Register Booking Agent Error]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});



// Remove or Fix Broken /:id Endpoint
router.get('/:id', authenticate(), async (req, res) => {

  try {
    const user = await models.User.findByPk(req.params.id, {
      attributes: ['id', 'email', 'role'],
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error' });
  }
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

