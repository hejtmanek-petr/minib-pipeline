const COOKIE_NAME = 'minib_access';

function requireAuth(req, res, next) {
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  if (cookie === 'full') {
    req.user = { id: 1, name: 'Admin', role: 'HQ', preferred_language: 'cs' };
    return next();
  }
  if (cookie === 'mea') {
    req.user = { id: 2, name: 'MEA', role: 'MEA', preferred_language: 'cs' };
    return next();
  }
  if (cookie === 'granted') {
    req.user = { id: 1, name: 'Admin', role: 'HQ', preferred_language: 'cs' };
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { requireAuth };
