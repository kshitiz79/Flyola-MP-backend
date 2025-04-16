const jwt = require('jsonwebtoken');

const authenticate = (roles = []) => {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
      console.log('[Auth Middleware] No token provided');
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.role && roles.length) {
        console.log('[Auth Middleware] Token missing role:', decoded);
        return res.status(403).json({ error: 'Forbidden: Invalid token payload' });
      }
      if (roles.length && !roles.includes(Number(decoded.role))) {
        console.log('[Auth Middleware] Insufficient permissions:', { userRole: decoded.role, requiredRoles: roles });
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