const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Mock support ticket data (in a real app, this would be in a database)
let supportTickets = [];
let ticketIdCounter = 1;

// Get user's support tickets
router.get('/tickets', authenticate(), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Filter tickets for the current user
    const userTickets = supportTickets.filter(ticket => ticket.user_id === userId);
    
    res.json({
      success: true,
      data: userTickets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get support tickets: ' + error.message
    });
  }
});

// Create a new support ticket
router.post('/tickets', authenticate(), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subject, category, priority, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Subject and message are required'
      });
    }

    const newTicket = {
      id: ticketIdCounter++,
      user_id: userId,
      subject,
      category: category || 'general',
      priority: priority || 'medium',
      message,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    supportTickets.push(newTicket);

    res.status(201).json({
      success: true,
      data: newTicket,
      message: 'Support ticket created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create support ticket: ' + error.message
    });
  }
});

// Get a specific support ticket
router.get('/tickets/:id', authenticate(), async (req, res) => {
  try {
    const userId = req.user?.id;
    const ticketId = parseInt(req.params.id);

    const ticket = supportTickets.find(t => t.id === ticketId && t.user_id === userId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Support ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get support ticket: ' + error.message
    });
  }
});

// Update a support ticket (for adding responses, etc.)
router.put('/tickets/:id', authenticate(), async (req, res) => {
  try {
    const userId = req.user?.id;
    const ticketId = parseInt(req.params.id);
    const { message, status } = req.body;

    const ticketIndex = supportTickets.findIndex(t => t.id === ticketId && t.user_id === userId);

    if (ticketIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Support ticket not found'
      });
    }

    // Update the ticket
    if (message) {
      supportTickets[ticketIndex].message = message;
    }
    if (status) {
      supportTickets[ticketIndex].status = status;
    }
    supportTickets[ticketIndex].updated_at = new Date().toISOString();

    res.json({
      success: true,
      data: supportTickets[ticketIndex],
      message: 'Support ticket updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update support ticket: ' + error.message
    });
  }
});

module.exports = router;