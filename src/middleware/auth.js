// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = (roles = []) => {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }
      req.user = decoded;
      next();
    } catch (err) {
      console.error('[Auth Middleware] Invalid Token:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
};

module.exports = { authenticate };
