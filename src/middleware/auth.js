// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticate = (roles = []) => {
  return (req, res, next) => {
    // 1. Check cookie
    let token = req.cookies?.token;

    // 2. Check standard Authorization header
    if (!token && req.headers.authorization) {
      const auth = req.headers.authorization.split(' ');
      if (auth[0] === 'Bearer' && auth[1]) {
        token = auth[1];
      }
    }

    // 3. Check custom token header
    if (!token && req.headers.token) {
      token = req.headers.token;
    }

    if (!token) {
      return res
        .status(401)
        .json({ error: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      // if specific roles required, enforce them
      if (roles.length && !roles.includes(Number(decoded.role))) {
        return res
          .status(403)
          .json({ error: 'Forbidden: Insufficient permissions' });
      }

      next();
    } catch (err) {
      console.error('[Auth Middleware] Invalid token:', err.message);
      return res
        .status(401)
        .json({ error: 'Unauthorized: Invalid token' });
    }
  };
};

module.exports = { authenticate };
