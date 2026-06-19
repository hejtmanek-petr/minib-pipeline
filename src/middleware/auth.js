const COOKIE_NAME = 'minib_access';
const COOKIE_VALUE = 'granted';

function requireAuth(req, res, next) {
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  if (cookie !== COOKIE_VALUE) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  // Provide a minimal user object so existing route code that reads req.user still works
  req.user = { id: 1, name: 'Admin', role: 'HQ', email: 'admin@minib.cz', preferred_language: 'cs' };
  next();
}

module.exports = { requireAuth };
