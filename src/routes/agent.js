
const express = require('express');
const router = express.Router();
const agentController = require('../controller/agentController');
const { authenticate } = require('../middleware/auth');

// Admin-only routes
router.post('/wallet/add', authenticate(), agentController.addWalletAmount);
router.get('/wallet/:agentId(\\d+)', authenticate(), agentController.getAgentWallet);
router.get('/', agentController.getAllAgents);
router.get('/:id(\\d+)',  agentController.getAgentById);

module.exports = router;
