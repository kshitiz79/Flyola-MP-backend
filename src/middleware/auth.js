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
      console.error('[Auth Middleware] No token provided:', {
        cookies: req.cookies,
        headers: req.headers.authorization,
      });
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.id) {
        console.error('[Auth Middleware] Token missing id:', decoded);
        return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
      }
      req.user = decoded;
      console.log('[Auth Middleware] Decoded user:', req.user);

      if (roles.length && !roles.includes(Number(decoded.role))) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      next();
    } catch (err) {
      console.error('[Auth Middleware] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
};

module.exports = { authenticate };