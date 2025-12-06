const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const models = require('../model');
const jwt = require('jsonwebtoken');

// Middleware to verify admin access
const verifyAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.headers.token || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (String(decoded.role) !== '1') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/schedules');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'schedule-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

// GET - Get current schedule file URL (Public)
router.get('/current', async (req, res) => {
  try {
    const setting = await models.SystemSettings.findOne({
      where: { setting_key: 'schedule_file_url' }
    });

    if (!setting) {
      return res.json({
        url: '/schedule-final.pdf', // Default fallback
        filename: 'schedule-final.pdf',
        uploadedAt: null
      });
    }

    const value = JSON.parse(setting.setting_value);
    return res.json({
      url: value.url || '/schedule-final.pdf',
      filename: value.filename || 'schedule-final.pdf',
      uploadedAt: value.uploadedAt || null
    });
  } catch (error) {
    console.error('Error fetching schedule file:', error);
    return res.status(500).json({ error: 'Failed to fetch schedule file' });
  }
});

// POST - Upload new schedule file (Admin only)
router.post('/upload', verifyAdmin, upload.single('scheduleFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/schedules/${req.file.filename}`;
    
    // Get old file to delete it
    const oldSetting = await models.SystemSettings.findOne({
      where: { setting_key: 'schedule_file_url' }
    });

    if (oldSetting) {
      const oldValue = JSON.parse(oldSetting.setting_value);
      if (oldValue.filename && oldValue.filename !== 'schedule-final.pdf') {
        const oldFilePath = path.join(__dirname, '../../uploads/schedules', oldValue.filename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
    }

    // Save new file info to database
    const [setting, created] = await models.SystemSettings.findOrCreate({
      where: { setting_key: 'schedule_file_url' },
      defaults: {
        setting_value: JSON.stringify({
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id
        }),
        description: 'Schedule file download URL'
      }
    });

    if (!created) {
      await setting.update({
        setting_value: JSON.stringify({
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id
        })
      });
    }

    return res.json({
      message: 'Schedule file uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Error uploading schedule file:', error);
    return res.status(500).json({ error: 'Failed to upload schedule file' });
  }
});

// DELETE - Delete schedule file (Admin only)
router.delete('/delete', verifyAdmin, async (req, res) => {
  try {
    const setting = await models.SystemSettings.findOne({
      where: { setting_key: 'schedule_file_url' }
    });

    if (!setting) {
      return res.status(404).json({ error: 'No schedule file found' });
    }

    const value = JSON.parse(setting.setting_value);
    
    // Delete physical file
    if (value.filename && value.filename !== 'schedule-final.pdf') {
      const filePath = path.join(__dirname, '../../uploads/schedules', value.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Reset to default
    await setting.update({
      setting_value: JSON.stringify({
        url: '/schedule-final.pdf',
        filename: 'schedule-final.pdf',
        uploadedAt: null
      })
    });

    return res.json({ message: 'Schedule file deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule file:', error);
    return res.status(500).json({ error: 'Failed to delete schedule file' });
  }
});

module.exports = router;
