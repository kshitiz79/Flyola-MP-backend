const models = require('../model');
const jwt = require('jsonwebtoken');

// Middleware to verify admin access
const verifyAdmin = (req) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : req.headers.token || req.cookies?.token;

  if (!token) {
    throw new Error('Unauthorized: No token provided');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (String(decoded.role) !== '1') {
    throw new Error('Forbidden: Admin access required');
  }

  return decoded;
};

// Get booking cutoff settings (public endpoint - no auth required)
const getBookingCutoffTime = async (req, res) => {
  try {
    const settings = await models.SystemSettings.findAll({
      where: {
        setting_key: ['flight_cutoff_time', 'helicopter_cutoff_time', 'advance_booking_cutoff']
      }
    });

    const result = {
      flight_cutoff_time: '09:00',
      helicopter_cutoff_time: '09:00',
      advance_booking_days: 0,
      description: 'Default booking cutoff settings'
    };

    settings.forEach(setting => {
      const value = JSON.parse(setting.setting_value);
      if (setting.setting_key === 'flight_cutoff_time') {
        result.flight_cutoff_time = value.time;
      } else if (setting.setting_key === 'helicopter_cutoff_time') {
        result.helicopter_cutoff_time = value.time;
      } else if (setting.setting_key === 'advance_booking_cutoff') {
        result.advance_booking_days = value.days;
      }
    });

    return res.json(result);
  } catch (error) {
    console.error('Error fetching booking cutoff settings:', error);
    return res.status(500).json({ error: 'Failed to fetch booking cutoff settings' });
  }
};

// Update booking cutoff settings (admin only)
const updateBookingCutoffTime = async (req, res) => {
  try {
    const admin = verifyAdmin(req);
    const { flight_cutoff_time, helicopter_cutoff_time, advance_booking_days } = req.body;

    const updates = [];

    // Update flight cutoff time
    if (flight_cutoff_time !== undefined) {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(flight_cutoff_time)) {
        return res.status(400).json({ 
          error: 'Invalid flight cutoff time format. Use HH:MM format (e.g., 09:00, 18:00)' 
        });
      }

      const [setting, created] = await models.SystemSettings.findOrCreate({
        where: { setting_key: 'flight_cutoff_time' },
        defaults: {
          setting_value: JSON.stringify({ time: flight_cutoff_time }),
          description: `Flight bookings will be disabled after ${flight_cutoff_time} IST on the departure date`,
          updated_by: admin.id
        }
      });

      if (!created) {
        await setting.update({
          setting_value: JSON.stringify({ time: flight_cutoff_time }),
          description: `Flight bookings will be disabled after ${flight_cutoff_time} IST on the departure date`,
          updated_by: admin.id
        });
      }
      updates.push('flight_cutoff_time');
    }

    // Update helicopter cutoff time
    if (helicopter_cutoff_time !== undefined) {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(helicopter_cutoff_time)) {
        return res.status(400).json({ 
          error: 'Invalid helicopter cutoff time format. Use HH:MM format (e.g., 09:00, 18:00)' 
        });
      }

      const [setting, created] = await models.SystemSettings.findOrCreate({
        where: { setting_key: 'helicopter_cutoff_time' },
        defaults: {
          setting_value: JSON.stringify({ time: helicopter_cutoff_time }),
          description: `Helicopter bookings will be disabled after ${helicopter_cutoff_time} IST on the departure date`,
          updated_by: admin.id
        }
      });

      if (!created) {
        await setting.update({
          setting_value: JSON.stringify({ time: helicopter_cutoff_time }),
          description: `Helicopter bookings will be disabled after ${helicopter_cutoff_time} IST on the departure date`,
          updated_by: admin.id
        });
      }
      updates.push('helicopter_cutoff_time');
    }

    // Update advance booking cutoff
    if (advance_booking_days !== undefined) {
      const days = parseInt(advance_booking_days);
      if (isNaN(days) || days < 0 || days > 30) {
        return res.status(400).json({ 
          error: 'Invalid advance booking days. Must be between 0 and 30' 
        });
      }

      const [setting, created] = await models.SystemSettings.findOrCreate({
        where: { setting_key: 'advance_booking_cutoff' },
        defaults: {
          setting_value: JSON.stringify({ days: days }),
          description: days === 0 
            ? 'No advance booking cutoff (same-day only)'
            : `Bookings disabled ${days} day(s) before departure`,
          updated_by: admin.id
        }
      });

      if (!created) {
        await setting.update({
          setting_value: JSON.stringify({ days: days }),
          description: days === 0 
            ? 'No advance booking cutoff (same-day only)'
            : `Bookings disabled ${days} day(s) before departure`,
          updated_by: admin.id
        });
      }
      updates.push('advance_booking_days');
    }

    return res.json({
      success: true,
      message: `Booking cutoff settings updated successfully: ${updates.join(', ')}`,
      updated_by: admin.id
    });
  } catch (error) {
    console.error('Error updating booking cutoff settings:', error);
    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update booking cutoff settings' });
  }
};

// Get all system settings (admin only)
const getAllSettings = async (req, res) => {
  try {
    verifyAdmin(req);

    const settings = await models.SystemSettings.findAll({
      order: [['setting_key', 'ASC']]
    });

    const formattedSettings = settings.map(s => ({
      key: s.setting_key,
      value: s.setting_value,
      description: s.description,
      updated_at: s.updated_at
    }));

    return res.json({ settings: formattedSettings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

module.exports = {
  getBookingCutoffTime,
  updateBookingCutoffTime,
  getAllSettings
};
