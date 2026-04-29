const { exec } = require('child_process');

// Track if restart is already scheduled
let restartScheduled = false;

// Toggle for auto-restart feature (can be controlled via API)
let autoRestartEnabled = false; // Default: OFF

// Function to enable auto-restart
const enableAutoRestart = () => {
  autoRestartEnabled = true;
  console.log('✅ Auto-restart ENABLED');
};

// Function to disable auto-restart
const disableAutoRestart = () => {
  autoRestartEnabled = false;
  console.log('❌ Auto-restart DISABLED');
};

// Function to check status
const getAutoRestartStatus = () => {
  return autoRestartEnabled;
};

// Middleware to auto-restart after data modifications
const autoRestartMiddleware = (req, res, next) => {
  // Only trigger on successful POST, PUT, DELETE operations
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // Check if it's a modification operation and successful
    const isModification = ['POST', 'PUT', 'DELETE'].includes(req.method);
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    
    // Only restart if feature is enabled
    if (isModification && isSuccess && autoRestartEnabled && !restartScheduled) {
      console.log(`🔄 Auto-restart triggered by ${req.method} ${req.path}`);
      
      restartScheduled = true;
      
      // Schedule restart after 2 seconds to allow response to be sent
      setTimeout(() => {
        console.log('🔄 Executing auto-restart...');
        
        // Try PM2 restart first
        exec('pm2 restart all', (error, stdout, stderr) => {
          if (error) {
            console.error('PM2 restart error:', error);
            // Fallback: exit process (works with nodemon, systemd, etc.)
            process.exit(0);
          }
          console.log('✅ PM2 restart successful');
          restartScheduled = false;
        });
      }, 2000);
    }
    
    return originalJson(data);
  };
  
  next();
};

module.exports = {
  autoRestartMiddleware,
  enableAutoRestart,
  disableAutoRestart,
  getAutoRestartStatus
};

