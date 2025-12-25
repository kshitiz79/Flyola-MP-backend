const { logActivity, logAdminActivity: logAdminActivityToDb } = require('../controller/logsController');

/**
 * Helper function to extract resource type from URL
 */
const extractResourceType = (url) => {
  if (url.includes('/flight-schedules')) return 'flight_schedule';
  if (url.includes('/flights')) return 'flight';
  if (url.includes('/helicopters')) return 'helicopter';
  if (url.includes('/helicopter-schedules')) return 'helicopter_schedule';
  if (url.includes('/helipads')) return 'helipad';
  if (url.includes('/airports')) return 'airport';
  if (url.includes('/users')) return 'user';
  if (url.includes('/coupons')) return 'coupon';
  if (url.includes('/bookings')) return 'booking';
  if (url.includes('/hotels')) return 'hotel';
  if (url.includes('/rooms')) return 'room';
  if (url.includes('/logs/errors')) return 'error_log';
  if (url.includes('/system-settings')) return 'system_settings';
  return 'unknown';
};

/**
 * Middleware to log admin activities
 * This middleware should be used on admin routes to track admin actions
 */
const createAdminActivityLogger = (action, description) => {
  return async (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Call original res.json FIRST to ensure response is sent
      const result = originalJson.call(this, data);
      
      // Then try to log (asynchronously, don't block the response)
      setImmediate(() => {
        try {
          // Only log if the operation was successful
          const isSuccessful = (
            (data && data.success === true) ||
            (data && data.message && res.statusCode < 400) ||
            (res.statusCode >= 200 && res.statusCode < 400)
          );
          
          if (isSuccessful) {
            // Extract admin user info from request
            const adminUser = req.user;
            
            if (adminUser && (adminUser.role_id === 1 || adminUser.role === 1)) {
              // Log to both regular user activity and dedicated admin activity logs
              
              // Regular user activity log (for backward compatibility)
              logActivity(
                adminUser.id,
                action,
                `Admin ${description}`,
                {
                  method: req.method,
                  url: req.originalUrl,
                  body: req.method !== 'GET' ? req.body : undefined,
                  params: req.params,
                  query: req.query,
                  adminAction: true
                },
                req,
                'SUCCESS'
              ).catch(err => {
                console.error('Failed to log admin activity to user_activity_logs:', err);
              });

              // Dedicated admin activity log
              logAdminActivityToDb({
                admin_user_id: adminUser.id,
                admin_email: adminUser.email,
                admin_name: adminUser.name || adminUser.email,
                action: action,
                description: description,
                resource_type: extractResourceType(req.originalUrl),
                resource_id: req.params.id || null,
                ip_address: req.ip || req.connection.remoteAddress,
                user_agent: req.get('User-Agent'),
                status: 'SUCCESS',
                details: {
                  method: req.method,
                  url: req.originalUrl,
                  body: req.method !== 'GET' ? req.body : undefined,
                  params: req.params,
                  query: req.query
                }
              }).catch(err => {
                console.error('Failed to log admin activity to admin_activity_logs:', err);
              });
            }
          }
        } catch (error) {
          console.error('Error in admin activity logger:', error);
        }
      });
      
      return result;
    };
    
    next();
  };
};

/**
 * Predefined admin activity loggers for common actions
 */
const adminActivityLoggers = {
  // Flight Schedule Management
  createSchedule: createAdminActivityLogger('ADMIN_CREATE_SCHEDULE', 'created a new flight schedule'),
  updateSchedule: createAdminActivityLogger('ADMIN_UPDATE_SCHEDULE', 'updated flight schedule'),
  deleteSchedule: createAdminActivityLogger('ADMIN_DELETE_SCHEDULE', 'deleted flight schedule'),
  activateAllSchedules: createAdminActivityLogger('ADMIN_ACTIVATE_ALL_SCHEDULES', 'activated all flight schedules'),
  deleteAllSchedules: createAdminActivityLogger('ADMIN_DELETE_ALL_SCHEDULES', 'deleted all flight schedules'),
  
  // User Management
  createUser: createAdminActivityLogger('ADMIN_CREATE_USER', 'created a new user'),
  updateUser: createAdminActivityLogger('ADMIN_UPDATE_USER', 'updated user information'),
  deleteUser: createAdminActivityLogger('ADMIN_DELETE_USER', 'deleted user'),
  
  // Flight Management
  createFlight: createAdminActivityLogger('ADMIN_CREATE_FLIGHT', 'created a new flight'),
  updateFlight: createAdminActivityLogger('ADMIN_UPDATE_FLIGHT', 'updated flight information'),
  deleteFlight: createAdminActivityLogger('ADMIN_DELETE_FLIGHT', 'deleted flight'),
  
  // Airport Management
  createAirport: createAdminActivityLogger('ADMIN_CREATE_AIRPORT', 'created a new airport'),
  updateAirport: createAdminActivityLogger('ADMIN_UPDATE_AIRPORT', 'updated airport information'),
  deleteAirport: createAdminActivityLogger('ADMIN_DELETE_AIRPORT', 'deleted airport'),
  
  // Helicopter Management
  createHelicopter: createAdminActivityLogger('ADMIN_CREATE_HELICOPTER', 'created a new helicopter'),
  updateHelicopter: createAdminActivityLogger('ADMIN_UPDATE_HELICOPTER', 'updated helicopter information'),
  deleteHelicopter: createAdminActivityLogger('ADMIN_DELETE_HELICOPTER', 'deleted helicopter'),
  
  // Helicopter Schedule Management
  createHelicopterSchedule: createAdminActivityLogger('ADMIN_CREATE_HELICOPTER_SCHEDULE', 'created helicopter schedule'),
  updateHelicopterSchedule: createAdminActivityLogger('ADMIN_UPDATE_HELICOPTER_SCHEDULE', 'updated helicopter schedule'),
  deleteHelicopterSchedule: createAdminActivityLogger('ADMIN_DELETE_HELICOPTER_SCHEDULE', 'deleted helicopter schedule'),
  
  // Helipad Management
  createHelipad: createAdminActivityLogger('ADMIN_CREATE_HELIPAD', 'created a new helipad'),
  updateHelipad: createAdminActivityLogger('ADMIN_UPDATE_HELIPAD', 'updated helipad information'),
  deleteHelipad: createAdminActivityLogger('ADMIN_DELETE_HELIPAD', 'deleted helipad'),
  
  // Coupon Management
  createCoupon: createAdminActivityLogger('ADMIN_CREATE_COUPON', 'created a new coupon'),
  updateCoupon: createAdminActivityLogger('ADMIN_UPDATE_COUPON', 'updated coupon'),
  deleteCoupon: createAdminActivityLogger('ADMIN_DELETE_COUPON', 'deleted coupon'),
  
  // Booking Management
  updateBooking: createAdminActivityLogger('ADMIN_UPDATE_BOOKING', 'updated booking'),
  cancelBooking: createAdminActivityLogger('ADMIN_CANCEL_BOOKING', 'cancelled booking'),
  refundBooking: createAdminActivityLogger('ADMIN_REFUND_BOOKING', 'processed booking refund'),
  
  // System Settings
  updateSystemSettings: createAdminActivityLogger('ADMIN_UPDATE_SETTINGS', 'updated system settings'),
  
  // Error Resolution
  resolveError: createAdminActivityLogger('ADMIN_RESOLVE_ERROR', 'marked error as resolved'),
  
  // Hotel Management (if applicable)
  createHotel: createAdminActivityLogger('ADMIN_CREATE_HOTEL', 'created a new hotel'),
  updateHotel: createAdminActivityLogger('ADMIN_UPDATE_HOTEL', 'updated hotel information'),
  deleteHotel: createAdminActivityLogger('ADMIN_DELETE_HOTEL', 'deleted hotel'),
  
  // Room Management
  createRoom: createAdminActivityLogger('ADMIN_CREATE_ROOM', 'created a new room'),
  updateRoom: createAdminActivityLogger('ADMIN_UPDATE_ROOM', 'updated room information'),
  deleteRoom: createAdminActivityLogger('ADMIN_DELETE_ROOM', 'deleted room'),
  
  // Generic admin actions
  viewDashboard: createAdminActivityLogger('ADMIN_VIEW_DASHBOARD', 'accessed admin dashboard'),
  exportData: createAdminActivityLogger('ADMIN_EXPORT_DATA', 'exported data'),
  importData: createAdminActivityLogger('ADMIN_IMPORT_DATA', 'imported data')
};

module.exports = {
  createAdminActivityLogger,
  adminActivityLoggers
};