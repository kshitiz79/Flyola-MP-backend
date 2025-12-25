const fs = require('fs');
const path = require('path');
const models = require('../model');
const { Op } = require('sequelize');

// System logs controller
const getSystemLogs = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            level = 'all', 
            search = '', 
            startDate = '', 
            endDate = '' 
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (level !== 'all') {
            whereConditions.level = level;
        }

        if (search) {
            whereConditions[Op.or] = [
                { message: { [Op.like]: `%${search}%` } },
                { source: { [Op.like]: `%${search}%` } },
                { user_email: { [Op.like]: `%${search}%` } }
            ];
        }

        if (startDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.gte]: startDate
            };
        }

        if (endDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.lte]: endDate + ' 23:59:59'
            };
        }

        // Get total count for pagination
        const total = await models.SystemLog.count({ where: whereConditions });

        // Get paginated results
        const offset = (page - 1) * limit;
        const logs = await models.SystemLog.findAll({
            where: whereConditions,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching system logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch system logs'
        });
    }
};

// User activity logs controller
const getUserActivity = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            action = 'all', 
            search = '', 
            startDate = '', 
            endDate = '' 
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (action !== 'all') {
            whereConditions.action = action;
        }

        if (search) {
            whereConditions[Op.or] = [
                { user_email: { [Op.like]: `%${search}%` } },
                { user_name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        if (startDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.gte]: startDate
            };
        }

        if (endDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.lte]: endDate + ' 23:59:59'
            };
        }

        // Get total count for pagination
        const total = await models.UserActivityLog.count({ where: whereConditions });

        // Get paginated results
        const activities = await models.UserActivityLog.findAll({
            where: whereConditions,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: (page - 1) * limit
        });

        res.json({
            success: true,
            data: activities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user activity'
        });
    }
};

// Error logs controller
const getErrorLogs = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            severity = 'all', 
            search = '', 
            startDate = '', 
            endDate = '' 
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (severity !== 'all') {
            whereConditions.severity = severity;
        }

        if (search) {
            whereConditions[Op.or] = [
                { message: { [Op.like]: `%${search}%` } },
                { source: { [Op.like]: `%${search}%` } },
                { error_code: { [Op.like]: `%${search}%` } },
                { user_email: { [Op.like]: `%${search}%` } }
            ];
        }

        if (startDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.gte]: startDate
            };
        }

        if (endDate) {
            whereConditions.timestamp = {
                ...whereConditions.timestamp,
                [Op.lte]: endDate + ' 23:59:59'
            };
        }

        // Get total count for pagination
        const total = await models.ErrorLog.count({ where: whereConditions });

        // Get paginated results
        const errors = await models.ErrorLog.findAll({
            where: whereConditions,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: (page - 1) * limit
        });

        res.json({
            success: true,
            data: errors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching error logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch error logs'
        });
    }
};

// Log a new activity (for use by other controllers)
const logActivity = async (userId, action, description, details = {}, req = null, status = 'SUCCESS') => {
    try {
        // Get user details if userId is provided
        let userEmail = null;
        let userName = null;
        
        if (userId) {
            const user = await models.User.findByPk(userId);
            if (user) {
                userEmail = user.email;
                userName = user.name;
            }
        }

        const activityData = {
            user_id: userId,
            user_email: userEmail,
            user_name: userName,
            action,
            description,
            ip_address: req ? (req.ip || req.connection.remoteAddress) : null,
            user_agent: req ? req.get('User-Agent') : null,
            status,
            details: details,
            timestamp: new Date()
        };

        // Save to database
        await models.UserActivityLog.create(activityData);
        
        return true;
    } catch (error) {
        console.error('Error logging activity:', error);
        return false;
    }
};

// Log an error (for use by other controllers)
const logError = async (error, source, userId = null, context = {}, severity = 'HIGH') => {
    try {
        // Get user details if userId is provided
        let userEmail = null;
        
        if (userId) {
            const user = await models.User.findByPk(userId);
            if (user) {
                userEmail = user.email;
            }
        }

        // Extract line number from stack trace if available
        let lineNumber = null;
        if (error.stack) {
            const match = error.stack.match(/:(\d+):\d+/);
            if (match) {
                lineNumber = parseInt(match[1]);
            }
        }

        const errorData = {
            severity,
            error_code: error.code || 'UNKNOWN',
            message: error.message,
            source,
            line_number: lineNumber,
            user_id: userId,
            user_email: userEmail,
            payment_id: context.paymentId || null,
            booking_id: context.bookingId || null,
            stack_trace: error.stack,
            context: context,
            timestamp: new Date()
        };

        // Save to database
        await models.ErrorLog.create(errorData);
        
        return true;
    } catch (logError) {
        console.error('Error logging error:', logError);
        return false;
    }
};

// Log system events
const logSystem = async (level, message, source, userId = null, details = {}) => {
    try {
        // Get user details if userId is provided
        let userEmail = null;
        
        if (userId) {
            const user = await models.User.findByPk(userId);
            if (user) {
                userEmail = user.email;
            }
        }

        const logData = {
            level,
            message,
            source,
            user_id: userId,
            user_email: userEmail,
            payment_id: details.paymentId || null,
            booking_id: details.bookingId || null,
            details: details,
            timestamp: new Date()
        };

        // Save to database
        await models.SystemLog.create(logData);
        
        return true;
    } catch (error) {
        console.error('Error logging system event:', error);
        return false;
    }
};

// Log admin activity function
const logAdminActivity = async (activityData) => {
    try {
        // Validate required fields
        if (!activityData.admin_user_id || !activityData.action || !activityData.description) {
            console.error('Missing required fields for admin activity logging');
            return false;
        }

        // Save to database
        await models.AdminActivityLog.create(activityData);
        
        return true;
    } catch (error) {
        console.error('Error logging admin activity:', error);
        return false;
    }
};

// Get admin activities controller
const getAdminActivities = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            search = '', 
            action = '', 
            resource_type = '',
            admin_user_id = '',
            start_date = '', 
            end_date = '' 
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (search) {
            whereConditions[Op.or] = [
                { admin_email: { [Op.like]: `%${search}%` } },
                { admin_name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } },
                { action: { [Op.like]: `%${search}%` } }
            ];
        }

        if (action) {
            whereConditions.action = action;
        }

        if (resource_type) {
            whereConditions.resource_type = resource_type;
        }

        if (admin_user_id) {
            whereConditions.admin_user_id = admin_user_id;
        }

        if (start_date && end_date) {
            whereConditions.timestamp = {
                [Op.between]: [start_date, end_date]
            };
        } else if (start_date) {
            whereConditions.timestamp = {
                [Op.gte]: start_date
            };
        } else if (end_date) {
            whereConditions.timestamp = {
                [Op.lte]: end_date
            };
        }

        // Get total count for pagination
        const total = await models.AdminActivityLog.count({ where: whereConditions });

        // Get paginated results
        const offset = (page - 1) * limit;
        const activities = await models.AdminActivityLog.findAll({
            where: whereConditions,
            order: [['timestamp', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            success: true,
            data: activities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching admin activities:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch admin activities'
        });
    }
};

// Mark error as resolved
const markErrorResolved = async (req, res) => {
    try {
        const { id } = req.params;
        const { resolvedBy } = req.body;

        const error = await models.ErrorLog.findByPk(id);
        if (!error) {
            return res.status(404).json({
                success: false,
                error: 'Error log not found'
            });
        }

        await error.update({
            resolved: true,
            resolved_by: resolvedBy || 'admin',
            resolved_at: new Date()
        });

        res.json({
            success: true,
            message: 'Error marked as resolved'
        });

    } catch (error) {
        console.error('Error marking error as resolved:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark error as resolved'
        });
    }
};

module.exports = {
    getSystemLogs,
    getUserActivity,
    getErrorLogs,
    getAdminActivities,
    logActivity,
    logError,
    logSystem,
    logAdminActivity,
    markErrorResolved
};