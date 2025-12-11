const { logActivity, logError, logSystem } = require('../controller/logsController');
const models = require('../model');

// Middleware to log all API requests
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Store original res.json to intercept responses
    const originalJson = res.json;
    
    res.json = function(data) {
        const duration = Date.now() - startTime;
        
        // Log API request to database (async, don't wait)
        (async () => {
            try {
                await models.ApiRequestLog.create({
                    method: req.method,
                    url: req.originalUrl,
                    status_code: res.statusCode,
                    duration,
                    user_id: req.user ? req.user.id : null,
                    ip_address: req.ip || req.connection.remoteAddress,
                    user_agent: req.get('User-Agent'),
                    request_body: req.method !== 'GET' ? req.body : null,
                    response_body: res.statusCode >= 400 ? data : null
                });
            } catch (error) {
                console.error('Error logging API request:', error);
            }
        })();
        
        // If there's an error in the response, log it as an error
        if (res.statusCode >= 400 && data && data.error) {
            logError(
                { message: data.error, code: res.statusCode },
                `${req.method} ${req.originalUrl}`,
                req.user ? req.user.id : null,
                {
                    requestBody: req.body,
                    queryParams: req.query,
                    statusCode: res.statusCode
                },
                res.statusCode >= 500 ? 'CRITICAL' : 'MEDIUM'
            );
        }
        
        // Call original json method
        return originalJson.call(this, data);
    };
    
    next();
};

// Middleware to log user activities
const activityLogger = (action, description) => {
    return (req, res, next) => {
        // Store original res.json to log activity after successful response
        const originalJson = res.json;
        
        res.json = function(data) {
            // Only log activity if request was successful
            if (res.statusCode < 400 && req.user) {
                logActivity(
                    req.user.id,
                    action,
                    description,
                    {
                        requestBody: req.body,
                        queryParams: req.query,
                        responseData: data
                    },
                    req
                );
            }
            
            return originalJson.call(this, data);
        };
        
        next();
    };
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
    // Log the error
    logError(
        err,
        `${req.method} ${req.originalUrl}`,
        req.user ? req.user.id : null,
        {
            requestBody: req.body,
            queryParams: req.query,
            headers: req.headers,
            stack: err.stack
        }
    );
    
    // Continue with error handling
    next(err);
};

module.exports = {
    requestLogger,
    activityLogger,
    errorLogger
};