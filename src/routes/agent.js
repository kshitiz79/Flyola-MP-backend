
const express = require('express');
const router = express.Router();
const agentController = require('../controller/agentController');
const { authenticate } = require('../middleware/auth');

// Admin-only routes
router.post('/wallet/add',  agentController.addWalletAmount);
router.get('/wallet/:agentId(\\d+)',  agentController.getAgentWallet);
router.get('/', agentController.getAllAgents);
router.get('/:id(\\d+)',  agentController.getAgentById);

module.exports = router;
