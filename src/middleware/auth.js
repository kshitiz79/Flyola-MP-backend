const jwt = require('jsonwebtoken');

const authenticate = (roles = []) => {
  return (req, res, next) => {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization) {
      const auth = req.headers.authorization.split(' ');
      if (auth[0] === 'Bearer' && auth[1]) {
        token = auth[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.id) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
      }
      req.user = decoded;

      console.log('[Auth Middleware] User:', decoded.id, 'Role:', decoded.role, 'Required roles:', roles);

      if (roles.length && !roles.includes(Number(decoded.role))) {
        console.log('[Auth Middleware] Permission denied - User role:', decoded.role, 'Required:', roles);
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
};


module.exports = { authenticate };