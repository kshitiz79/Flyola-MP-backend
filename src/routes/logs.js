const express = require('express');
const router = express.Router();
const { getSystemLogs, getUserActivity, getErrorLogs, getAdminActivities, markErrorResolved } = require('../controller/logsController');
const { adminActivityLoggers } = require('../middleware/adminActivityLogger');

// System logs routes
router.get('/system', getSystemLogs);

// User activity routes  
router.get('/activity', getUserActivity);

// Admin activity routes
router.get('/admin-activity', getAdminActivities);

// Error logs routes
router.get('/errors', getErrorLogs);
router.put('/errors/:id/resolve', adminActivityLoggers.resolveError, markErrorResolved);

module.exports = router;