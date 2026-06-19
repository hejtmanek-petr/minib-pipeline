const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireHQ } = require('../middleware/permissions');

const router = express.Router();

router.use(requireAuth, requireHQ);

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferred_language: user.preferred_language,
    countries: user.countries ? JSON.parse(user.countries) : [],
    is_active: !!user.is_active,
    created_at: user.created_at,
  };
}

// --- Users ---

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY name').all();
  res.json({ users: users.map(publicUser) });
});

router.post('/users', (req, res) => {
  const { email, name, role, preferred_language, countries, password } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });

  const tempPassword = password || crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '!1';
  const password_hash = bcrypt.hashSync(tempPassword, 12);

  try {
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, name, role, preferred_language, countries, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      email.toLowerCase().trim(),
      password_hash,
      name,
      role === 'HQ' ? 'HQ' : 'DEALER',
      preferred_language === 'cs' ? 'cs' : 'en',
      countries ? JSON.stringify(countries) : null
    );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ user: publicUser(user), generatedPassword: password ? undefined : tempPassword });
  } catch (err) {
    res.status(400).json({ error: 'Could not create user (email may already exist)' });
  }
});

router.put('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, role, preferred_language, countries, is_active } = req.body || {};
  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      preferred_language = COALESCE(?, preferred_language),
      countries = ?,
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    name ?? null,
    role === 'HQ' || role === 'DEALER' ? role : null,
    preferred_language === 'cs' || preferred_language === 'en' ? preferred_language : null,
    countries !== undefined ? JSON.stringify(countries) : user.countries,
    is_active === undefined ? null : (is_active ? 1 : 0),
    user.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ user: publicUser(updated) });
});

router.post('/users/:id/reset-password', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '!1';
  const password_hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, user.id);

  res.json({ password: newPassword });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

// --- Settings / lookups ---

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  for (const r of rows) {
    try { settings[r.key] = JSON.parse(r.value); } catch (e) { settings[r.key] = r.value; }
  }
  res.json({ settings });
});

router.put('/settings/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};
  if (value === undefined) return res.status(400).json({ error: 'value is required' });

  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, JSON.stringify(value));

  res.json({ key, value });
});

module.exports = router;
