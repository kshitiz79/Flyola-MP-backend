const express = require('express');
const router = express.Router();
const { getSystemLogs, getUserActivity, getErrorLogs, markErrorResolved } = require('../controller/logsController');

// System logs routes
router.get('/system', getSystemLogs);

// User activity routes  
router.get('/activity', getUserActivity);

// Error logs routes
router.get('/errors', getErrorLogs);
router.put('/errors/:id/resolve', markErrorResolved);

module.exports = router;