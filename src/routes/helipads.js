const express = require('express');
const models = require('../model');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Get all helipads (now from Airport table with helipad facilities)
router.get('/', async (req, res) => {
  try {
    const airports = await models.Airport.findAll({
      where: { has_helipad: true },
      order: [['created_at', 'DESC']]
    });
    
    // Transform to match expected helipad structure
    const helipads = airports.map(airport => ({
      id: airport.id,
      helipad_code: airport.helipad_code || airport.airport_code,
      helipad_name: airport.helipad_name || airport.airport_name,
      city: airport.city,
      status: airport.status,
      created_at: airport.created_at,
      updated_at: airport.updated_at
    }));
    
    return res.json(helipads);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get helipad by ID (now from Airport table)
router.get('/:id', async (req, res) => {
  try {
    const airport = await models.Airport.findOne({
      where: { id: req.params.id, has_helipad: true }
    });
    
    if (!airport) {
      return res.status(404).json({ error: 'Helipad not found' });
    }
    
    // Transform to match expected helipad structure
    const helipad = {
      id: airport.id,
      helipad_code: airport.helipad_code || airport.airport_code,
      helipad_name: airport.helipad_name || airport.airport_name,
      city: airport.city,
      status: airport.status,
      created_at: airport.created_at,
      updated_at: airport.updated_at
    };
    
    return res.json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create new helipad (now creates helipad-only location in Airport table)
router.post('/', [
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
    const existingLocation = await models.Airport.findOne({
      where: { 
        [models.Sequelize.Op.or]: [
          { airport_code: req.body.helipad_code },
          { helipad_code: req.body.helipad_code }
        ]
      }
    });
    
    if (existingLocation) {
      return res.status(400).json({ error: 'Helipad code already exists' });
    }

    // Create helipad-only location in Airport table
    const airport = await models.Airport.create({
      city: req.body.city,
      airport_code: req.body.helipad_code, // Use helipad code as airport code for helipad-only locations
      airport_name: req.body.helipad_name, // Use helipad name as airport name
      has_helipad: true,
      helipad_code: req.body.helipad_code,
      helipad_name: req.body.helipad_name,
      status: req.body.status || 1
    });
    
    // Transform response to match expected helipad structure
    const helipad = {
      id: airport.id,
      helipad_code: airport.helipad_code,
      helipad_name: airport.helipad_name,
      city: airport.city,
      status: airport.status,
      created_at: airport.created_at,
      updated_at: airport.updated_at
    };
    
    return res.status(201).json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Update helipad (now updates Airport table)
router.put('/:id', [
  body('helipad_name').optional().notEmpty().withMessage('Helipad name cannot be empty'),
  body('helipad_code').optional().notEmpty().withMessage('Helipad code cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
], async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const airport = await models.Airport.findOne({
      where: { id: req.params.id, has_helipad: true }
    });
    
    if (!airport) {
      return res.status(404).json({ error: 'Helipad not found' });
    }

    // Check if helipad code is being changed and if it already exists
    if (req.body.helipad_code && req.body.helipad_code !== airport.helipad_code) {
      const existingLocation = await models.Airport.findOne({
        where: { 
          [models.Sequelize.Op.or]: [
            { airport_code: req.body.helipad_code },
            { helipad_code: req.body.helipad_code }
          ],
          id: { [models.Sequelize.Op.ne]: req.params.id }
        }
      });
      
      if (existingLocation) {
        return res.status(400).json({ error: 'Helipad code already exists' });
      }
    }

    // Update airport record with helipad data
    const updateData = {};
    if (req.body.city) updateData.city = req.body.city;
    if (req.body.helipad_name) {
      updateData.helipad_name = req.body.helipad_name;
      // If this is a helipad-only location, also update airport_name
      if (airport.airport_code === airport.helipad_code) {
        updateData.airport_name = req.body.helipad_name;
      }
    }
    if (req.body.helipad_code) {
      updateData.helipad_code = req.body.helipad_code;
      // If this is a helipad-only location, also update airport_code
      if (airport.airport_code === airport.helipad_code) {
        updateData.airport_code = req.body.helipad_code;
      }
    }
    if (req.body.status !== undefined) updateData.status = req.body.status;

    await airport.update(updateData);
    
    // Transform response to match expected helipad structure
    const helipad = {
      id: airport.id,
      helipad_code: airport.helipad_code,
      helipad_name: airport.helipad_name,
      city: airport.city,
      status: airport.status,
      created_at: airport.created_at,
      updated_at: airport.updated_at
    };
    
    return res.json(helipad);
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Delete helipad (now deletes from Airport table or removes helipad facilities)
router.delete('/:id', async (req, res) => {
  try {
    const airport = await models.Airport.findOne({
      where: { id: req.params.id, has_helipad: true }
    });
    
    if (!airport) {
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

    // Check if this is a helipad-only location or airport with helipad
    const isHelipadOnly = airport.airport_code === airport.helipad_code;
    
    if (isHelipadOnly) {
      // Delete the entire location if it's helipad-only
      await airport.destroy();
    } else {
      // Just remove helipad facilities if it's an airport with helipad
      await airport.update({
        has_helipad: false,
        helipad_code: null,
        helipad_name: null
      });
    }
    
    return res.json({ message: 'Helipad deleted successfully' });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;