const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

const COOKIE_NAME = 'minib_access';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

router.get('/users', (req, res) => {
  const bottom = new Set(['Monika', 'Pavla', 'Petr']);
  const all = db.prepare('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name').all();
  const users = [...all.filter(u => !bottom.has(u.name)), ...all.filter(u => bottom.has(u.name))];
  res.json({ users });
});

router.post('/login', loginLimiter, (req, res) => {
  const { userId, password } = req.body || {};

  if (!userId) {
    return res.status(401).json({ error: 'Select a user' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  // If password is set, verify it; if empty, allow login without password
  if (user.password_hash && user.password_hash.length > 0) {
    const bcrypt = require('bcrypt');
    if (!password || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
  }

  const roleKey = user.access_role || 'mea_sales';

  const cookieValue = JSON.stringify({ id: user.id, role: roleKey });
  res.cookie(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });

  // Log login
  db.prepare('INSERT INTO login_history (user_id, user_name, ip, user_agent) VALUES (?,?,?,?)')
    .run(user.id, user.name, req.ip, (req.headers['user-agent'] || '').slice(0, 200));

  res.json({
    user: {
      id: user.id,
      name: user.name,
      role: roleKey,
      preferred_language: user.preferred_language || 'en',
    },
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login.html');
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const bcrypt = require('bcrypt');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.password_hash && user.password_hash.length > 0) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }
  }

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?').run(hash, newPassword, req.user.id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Admin-only: list users with passwords
router.get('/admin/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = db.prepare('SELECT id, name, email, access_role, password_plain, is_active FROM users ORDER BY name').all();
  res.json({ users });
});

// Admin-only: login history
router.get('/admin/login-history', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const limit = parseInt(req.query.limit) || 50;
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
  const history = db.prepare('SELECT * FROM login_history WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?').all(sixMonthsAgo, limit);
  res.json({ history });
});

router.post('/preferred-language', requireAuth, (req, res) => {
  const { language } = req.body || {};
  if (language) {
    db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(language, req.user.id);
  }
  res.json({ ok: true });
});

module.exports = router;
