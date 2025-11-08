const express = require('express');
const models = require('../model');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Get all helicopters
router.get('/', async (req, res) => {
  try {
    const helicopters = await models.Helicopter.findAll({
      order: [['created_at', 'DESC']]
    });
    return res.json(helicopters);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get helicopter by ID
router.get('/:id', async (req, res) => {
  try {
    const helicopter = await models.Helicopter.findByPk(req.params.id);
    if (!helicopter) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }
    return res.json(helicopter);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create new helicopter
router.post('/', [
  body('helicopter_number').notEmpty().withMessage('Helicopter number is required'),
  body('departure_day').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Valid departure day is required'),
  body('start_helipad_id').isInt({ min: 1 }).withMessage('Start helipad is required'),
  body('end_helipad_id').isInt({ min: 1 }).withMessage('End helipad is required'),
  body('seat_limit').isInt({ min: 1 }).withMessage('Seat limit must be a positive integer'),
], async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if helicopter number already exists
    const existingHelicopter = await models.Helicopter.findOne({
      where: { helicopter_number: req.body.helicopter_number }
    });
    
    if (existingHelicopter) {
      return res.status(400).json({ error: 'Helicopter number already exists' });
    }

    // Validate helipad locations exist and have helipad facilities
    let validationWarnings = [];
    try {
      // Check if Airport model exists
      if (!models.Airport) {
        return res.status(500).json({ error: 'Airport model not available' });
      }
      
      // Debug: Check total airports and helipad locations
      const totalAirports = await models.Airport.count();
      const helipadLocations = await models.Airport.count({ where: { has_helipad: true } });
      const startLocation = await models.Airport.findOne({
        where: { id: req.body.start_helipad_id, has_helipad: true }
      });
      const endLocation = await models.Airport.findOne({
        where: { id: req.body.end_helipad_id, has_helipad: true }
      });

      if (!startLocation) {
        // Check if location exists without helipad facilities
        const startAnyLocation = await models.Airport.findByPk(req.body.start_helipad_id);
        if (!startAnyLocation) {
          // If no helipad locations exist at all, allow creation with warning
          if (helipadLocations === 0) {
            validationWarnings.push(`Start location ID ${req.body.start_helipad_id} not validated (no helipad locations configured yet)`);
          } else {
            return res.status(400).json({ error: 'Start location not found' });
          }
        } else {
          validationWarnings.push('Start location exists but does not have helipad facilities');
        }
      }
      if (!endLocation) {
        // Check if location exists without helipad facilities
        const endAnyLocation = await models.Airport.findByPk(req.body.end_helipad_id);
        if (!endAnyLocation) {
          // If no helipad locations exist at all, allow creation with warning
          if (helipadLocations === 0) {
            validationWarnings.push(`End location ID ${req.body.end_helipad_id} not validated (no helipad locations configured yet)`);
          } else {
            return res.status(400).json({ error: 'End location not found' });
          }
        } else {
          validationWarnings.push('End location exists but does not have helipad facilities');
        }
      }
    } catch (validationError) {
      return res.status(500).json({ 
        error: 'Failed to validate helipad locations', 
        details: process.env.NODE_ENV === 'development' ? validationError.message : undefined 
      });
    }

    const helicopter = await models.Helicopter.create(req.body);
    
    const response = {
      ...helicopter.toJSON(),
      warnings: validationWarnings.length > 0 ? validationWarnings : undefined
    };
    
    return res.status(201).json(response);
  } catch (err) {
    
    // Handle specific database constraint errors
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        error: 'Database constraint error - please ensure helipad locations exist and run database migration',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Foreign key constraint failed',
        suggestion: 'Run the database migration script to update foreign key constraints'
      });
    }
    
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        error: 'Helicopter number already exists',
        details: 'Please choose a different helicopter number'
      });
    }
    
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update helicopter
router.put('/:id', [
  body('helicopter_number').optional().notEmpty().withMessage('Helicopter number cannot be empty'),
  body('departure_day').optional().isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).withMessage('Valid departure day is required'),
  body('start_helipad_id').optional().isInt({ min: 1 }).withMessage('Start helipad must be valid'),
  body('end_helipad_id').optional().isInt({ min: 1 }).withMessage('End helipad must be valid'),
  body('seat_limit').optional().isInt({ min: 1 }).withMessage('Seat limit must be a positive integer'),
], async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const helicopter = await models.Helicopter.findByPk(req.params.id);
    if (!helicopter) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }

    // Check if helicopter number is being changed and if it already exists
    if (req.body.helicopter_number && req.body.helicopter_number !== helicopter.helicopter_number) {
      const existingHelicopter = await models.Helicopter.findOne({
        where: { 
          helicopter_number: req.body.helicopter_number,
          id: { [models.Sequelize.Op.ne]: req.params.id }
        }
      });
      
      if (existingHelicopter) {
        return res.status(400).json({ error: 'Helicopter number already exists' });
      }
    }

    // Validate helipad locations if they are being updated
    let validationWarnings = [];
    try {
      if (req.body.start_helipad_id) {
        const startLocation = await models.Airport.findOne({
          where: { id: req.body.start_helipad_id, has_helipad: true }
        });
        if (!startLocation) {
          // Check if location exists without helipad facilities
          const startAnyLocation = await models.Airport.findByPk(req.body.start_helipad_id);
          if (!startAnyLocation) {
            return res.status(400).json({ error: 'Start location not found' });
          } else {
            validationWarnings.push('Start location exists but does not have helipad facilities');
          }
        }
      }
      
      if (req.body.end_helipad_id) {
        const endLocation = await models.Airport.findOne({
          where: { id: req.body.end_helipad_id, has_helipad: true }
        });
        if (!endLocation) {
          // Check if location exists without helipad facilities
          const endAnyLocation = await models.Airport.findByPk(req.body.end_helipad_id);
          if (!endAnyLocation) {
            return res.status(400).json({ error: 'End location not found' });
          } else {
            validationWarnings.push('End location exists but does not have helipad facilities');
          }
        }
      }
    } catch (validationError) {
      return res.status(500).json({ 
        error: 'Failed to validate helipad locations', 
        details: process.env.NODE_ENV === 'development' ? validationError.message : undefined 
      });
    }

    await helicopter.update(req.body);
    
    const response = {
      ...helicopter.toJSON(),
      warnings: validationWarnings.length > 0 ? validationWarnings : undefined
    };
    
    return res.json(response);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Delete helicopter
router.delete('/:id', async (req, res) => {
  try {
    const helicopter = await models.Helicopter.findByPk(req.params.id);
    if (!helicopter) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }

    // Check if helicopter has any schedules
    const scheduleCount = await models.HelicopterSchedule.count({
      where: { helicopter_id: req.params.id }
    });
    
    if (scheduleCount > 0) {
      return res.status(400).json({
        error: `Cannot delete helicopter with ${scheduleCount} existing schedules. Please remove schedules first.`
      });
    }

    await helicopter.destroy();
    return res.json({ message: 'Helicopter deleted successfully' });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;