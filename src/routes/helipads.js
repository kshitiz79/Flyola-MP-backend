const express = require('express');
const models = require('../model');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

const router = express.Router();

// Public routes (no authentication required)
router.get('/', async (req, res) => {
  try {
    const helipads = await models.Helipad.findAll({
      order: [['created_at', 'DESC']]
    });
    
    return res.json(helipads);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const helipad = await models.Helipad.findByPk(req.params.id);
    
    if (!helipad) {
      return res.status(404).json({ error: 'Helipad not found' });
    }
    
    return res.json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Admin routes (authentication required)
router.post('/', authenticate([1]), adminActivityLoggers.createHelipad, [
  body('helipad_name').notEmpty().withMessage('Helipad name is required'),
  body('helipad_code').notEmpty().withMessage('Helipad code is required'),
  body('city').notEmpty().withMessage('City is required'),
], async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if helipad code already exists
    const existingHelipad = await models.Helipad.findOne({
      where: { helipad_code: req.body.helipad_code }
    });
    
    if (existingHelipad) {
      return res.status(400).json({ error: 'Helipad code already exists' });
    }

    // Create helipad in helipads table
    const helipad = await models.Helipad.create({
      city: req.body.city,
      helipad_code: req.body.helipad_code,
      helipad_name: req.body.helipad_name,
      status: req.body.status || 1
    });
    
    return res.status(201).json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.put('/:id', authenticate([1]), adminActivityLoggers.updateHelipad, [
  body('helipad_name').optional().notEmpty().withMessage('Helipad name cannot be empty'),
  body('helipad_code').optional().notEmpty().withMessage('Helipad code cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
], async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const helipad = await models.Helipad.findByPk(req.params.id);
    
    if (!helipad) {
      return res.status(404).json({ error: 'Helipad not found' });
    }

    // Check if helipad code is being changed and if it already exists
    if (req.body.helipad_code && req.body.helipad_code !== helipad.helipad_code) {
      const existingHelipad = await models.Helipad.findOne({
        where: { 
          helipad_code: req.body.helipad_code,
          id: { [models.Sequelize.Op.ne]: req.params.id }
        }
      });
      
      if (existingHelipad) {
        return res.status(400).json({ error: 'Helipad code already exists' });
      }
    }

    // Update helipad record
    const updateData = {};
    if (req.body.city) updateData.city = req.body.city;
    if (req.body.helipad_name) updateData.helipad_name = req.body.helipad_name;
    if (req.body.helipad_code) updateData.helipad_code = req.body.helipad_code;
    if (req.body.status !== undefined) updateData.status = req.body.status;

    await helipad.update(updateData);
    
    return res.json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.delete('/:id', authenticate([1]), adminActivityLoggers.deleteHelipad, async (req, res) => {
  try {
    const helipad = await models.Helipad.findByPk(req.params.id);
    
    if (!helipad) {
      return res.status(404).json({ error: 'Helipad not found' });
    }

    // Check if helipad has any helicopters or schedules
    const helicopterCount = await models.Helicopter.count({
      where: {
        [models.Sequelize.Op.or]: [
          { start_helipad_id: req.params.id },
          { end_helipad_id: req.params.id }
        ]
      }
    });
    
    if (helicopterCount > 0) {
      return res.status(400).json({
        error: `Cannot delete helipad with ${helicopterCount} existing helicopters. Please remove helicopters first.`
      });
    }

    const scheduleCount = await models.HelicopterSchedule.count({
      where: {
        [models.Sequelize.Op.or]: [
          { departure_helipad_id: req.params.id },
          { arrival_helipad_id: req.params.id }
        ]
      }
    });
    
    if (scheduleCount > 0) {
      return res.status(400).json({
        error: `Cannot delete helipad with ${scheduleCount} existing schedules. Please remove schedules first.`
      });
    }

    // Delete the helipad
    await helipad.destroy();
    
    return res.json({ message: 'Helipad deleted successfully' });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;