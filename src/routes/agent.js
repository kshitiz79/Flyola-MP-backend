
const express = require('express');
const router = express.Router();
const agentController = require('../controller/agentController');
const { authenticate } = require('../middleware/auth');

// Admin-only routes
router.post('/wallet/add',  agentController.addWalletAmount);
router.post('/wallet/deduct',  agentController.deductWalletAmount);
router.get('/wallet/:agentId(\\d+)',  agentController.getAgentWallet);
router.get('/', agentController.getAllAgents);
router.get('/:id(\\d+)',  agentController.getAgentById);
router.get('/:agentId(\\d+)/bookings', agentController.getAgentBookings);
router.get('/admin/dashboard', agentController.getAgentDashboardData);
router.post('/recalculate-stats', agentController.recalculateAgentStats);
router.post('/:agentId(\\d+)/recalculate-stats', agentController.recalculateAgentStats);

module.exports = router;
