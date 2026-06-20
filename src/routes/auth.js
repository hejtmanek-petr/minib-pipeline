const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_NAME = 'minib_access';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { code } = req.body || {};
  const trimmed = (code || '').trim();
  const codeFull = process.env.ACCESS_CODE_FULL || 'minib2024';
  const codeMea  = process.env.ACCESS_CODE_MEA  || 'mea2024';

  let role = null;
  if (trimmed === codeFull) role = 'full';
  else if (trimmed === codeMea) role = 'mea';

  if (!role) {
    return res.status(401).json({ error: 'Nesprávný přístupový kód' });
  }

  res.cookie(COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });

  const user = role === 'full'
    ? { id: 1, name: 'Admin', role: 'HQ', preferred_language: 'cs' }
    : { id: 2, name: 'MEA', role: 'MEA', preferred_language: 'cs' };

  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login.html');
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/preferred-language', requireAuth, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
