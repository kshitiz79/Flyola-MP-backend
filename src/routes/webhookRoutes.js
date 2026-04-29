const express = require('express');
const router = express.Router();
const webhookController = require('../controller/webhookController');

// Manual restart endpoint
router.post('/restart', webhookController.restartApp);

// Shutdown server completely (port 4000 free ho jayega)
router.post('/shutdown', webhookController.shutdownServer);

// Enable auto-restart
router.post('/auto-restart/enable', webhookController.enableAutoRestart);

// Disable auto-restart
router.post('/auto-restart/disable', webhookController.disableAutoRestart);

// Get auto-restart status
router.get('/auto-restart/status', webhookController.getAutoRestartStatus);

// Reload cache endpoint
router.post('/reload-cache', webhookController.reloadCache);

// Health check endpoint
router.get('/health', webhookController.healthCheck);

module.exports = router;
