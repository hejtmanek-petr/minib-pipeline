const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_NAME = 'minib_access';
const COOKIE_VALUE = 'granted';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const ADMIN_USER = {
  id: 1,
  email: 'admin@minib.cz',
  name: 'Admin',
  role: 'HQ',
  preferred_language: 'cs',
  countries: [],
};

router.post('/login', loginLimiter, (req, res) => {
  const { code } = req.body || {};
  const expected = process.env.ACCESS_CODE || 'minib2024';
  if (!code || code.trim() !== expected) {
    return res.status(401).json({ error: 'Nesprávný přístupový kód' });
  }
  res.cookie(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ user: ADMIN_USER });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/preferred-language', requireAuth, (req, res) => {
  // Language preference stored client-side only in single-user mode
  res.json({ ok: true });
});

module.exports = router;
