const { exec } = require('child_process');
const path = require('path');
const { 
  enableAutoRestart, 
  disableAutoRestart, 
  getAutoRestartStatus 
} = require('../middleware/autoRestartMiddleware');

// Restart the application
exports.restartApp = async (req, res) => {
  try {
    console.log('🔄 Restart request received');
    
    // Send response immediately before restarting
    res.json({ 
      success: true, 
      message: 'Application restart initiated' 
    });

    // Delay restart slightly to ensure response is sent
    setTimeout(() => {
      console.log('🔄 Restarting application...');
      
      // If using PM2
      exec('pm2 restart all', (error, stdout, stderr) => {
        if (error) {
          console.error('PM2 restart error:', error);
          // Fallback: exit process (if using nodemon or other process manager)
          process.exit(0);
        }
        console.log('✅ PM2 restart successful:', stdout);
      });
    }, 500);

  } catch (error) {
    console.error('Error restarting app:', error);
    res.status(500).json({ error: 'Failed to restart application' });
  }
};

// Shutdown the server completely
exports.shutdownServer = async (req, res) => {
  try {
    console.log('🛑 Shutdown request received');
    
    // Send response immediately before shutting down
    res.json({ 
      success: true, 
      message: 'Server shutdown initiated. Port 4000 will be free.' 
    });

    // Delay shutdown slightly to ensure response is sent
    setTimeout(() => {
      console.log('🛑 Shutting down server...');
      
      // Try PM2 stop first
      exec('pm2 stop all', (error, stdout, stderr) => {
        if (error) {
          console.error('PM2 stop error, using process.exit:', error);
        } else {
          console.log('✅ PM2 stopped:', stdout);
        }
        // Force exit the process
        process.exit(0);
      });
    }, 500);

  } catch (error) {
    console.error('Error shutting down server:', error);
    res.status(500).json({ error: 'Failed to shutdown server' });
  }
};

// Enable auto-restart feature
exports.enableAutoRestart = async (req, res) => {
  try {
    enableAutoRestart();
    res.json({ 
      success: true, 
      message: 'Auto-restart ENABLED',
      status: 'enabled'
    });
  } catch (error) {
    console.error('Error enabling auto-restart:', error);
    res.status(500).json({ error: 'Failed to enable auto-restart' });
  }
};

// Disable auto-restart feature
exports.disableAutoRestart = async (req, res) => {
  try {
    disableAutoRestart();
    res.json({ 
      success: true, 
      message: 'Auto-restart DISABLED',
      status: 'disabled'
    });
  } catch (error) {
    console.error('Error disabling auto-restart:', error);
    res.status(500).json({ error: 'Failed to disable auto-restart' });
  }
};

// Get auto-restart status
exports.getAutoRestartStatus = async (req, res) => {
  try {
    const status = getAutoRestartStatus();
    res.json({ 
      success: true, 
      autoRestart: status ? 'enabled' : 'disabled',
      enabled: status
    });
  } catch (error) {
    console.error('Error getting auto-restart status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

// Reload cache or specific services without full restart
exports.reloadCache = async (req, res) => {
  try {
    console.log('🔄 Cache reload request received');
    
    // Add your cache clearing logic here
    // For example: clear Redis cache, reload configurations, etc.
    
    res.json({ 
      success: true, 
      message: 'Cache reloaded successfully' 
    });
  } catch (error) {
    console.error('Error reloading cache:', error);
    res.status(500).json({ error: 'Failed to reload cache' });
  }
};

// Health check endpoint
exports.healthCheck = async (req, res) => {
  const autoRestartStatus = getAutoRestartStatus();
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    autoRestart: autoRestartStatus ? 'enabled' : 'disabled'
  });
};
