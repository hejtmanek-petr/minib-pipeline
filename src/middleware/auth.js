const COOKIE_NAME = 'minib_access';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — enforced server-side, independent of browser cookie expiry
const db = require('../db');

function requireAuth(req, res, next) {
  const cookie = req.cookies && req.cookies[COOKIE_NAME];
  if (!cookie) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const parsed = JSON.parse(cookie);
    // Cookies issued before this session-timeout feature have no iat and are treated as expired.
    if (!parsed.iat || Date.now() - parsed.iat > SESSION_MAX_AGE_MS) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Session expired' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(parsed.id);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    req.user = {
      id: user.id,
      name: user.name,
      role: user.access_role || 'mea_sales',
      preferred_language: user.preferred_language || 'en',
    };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { requireAuth };
