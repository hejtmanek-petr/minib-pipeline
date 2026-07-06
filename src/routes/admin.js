const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { generateCsv } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireHQ } = require('../middleware/permissions');
const ai = require('../services/ai');
const autoAssess = require('../services/autoAssess');

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

router.get('/settings-history', (req, res) => {
  db.prepare("DELETE FROM settings_history WHERE created_at < datetime('now', '-3 months')").run();
  const history = db.prepare('SELECT * FROM settings_history ORDER BY created_at DESC LIMIT 100').all();
  res.json({ history });
});

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

  const old = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  const oldValue = old ? old.value : null;
  const newValue = JSON.stringify(value);

  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, newValue);

  db.prepare('INSERT INTO settings_history (user_id, user_name, setting_key, old_value, new_value) VALUES (?,?,?,?,?)')
    .run(req.user.id, req.user.name, key, oldValue, newValue);

  // Cleanup: delete entries older than 3 months
  db.prepare("DELETE FROM settings_history WHERE created_at < datetime('now', '-3 months')").run();

  res.json({ key, value });
});

// POST /api/admin/delete-comments-by-ids
router.post('/delete-comments-by-ids', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const stmt = db.prepare('DELETE FROM comments WHERE id = ?');
  const tx = db.transaction(() => ids.forEach(id => stmt.run(id)));
  tx();
  res.json({ deleted: ids.length });
});

// POST /api/admin/import-comments — upsert comments from local export
router.post('/import-comments', (req, res) => {
  const comments = req.body.comments;
  if (!Array.isArray(comments)) return res.status(400).json({ error: 'comments array required' });

  const upsert = db.prepare(`
    INSERT INTO comments (id, project_id, user_id, content, source, original_language, raw_transcript, title, audio_url, content_cs, content_en, content_de, content_tr, created_at)
    VALUES (@id, @project_id, @user_id, @content, @source, @original_language, @raw_transcript, @title, @audio_url, @content_cs, @content_en, @content_de, @content_tr, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      content=excluded.content, title=excluded.title,
      content_cs=excluded.content_cs, content_en=excluded.content_en,
      content_de=excluded.content_de, content_tr=excluded.content_tr
  `);

  let inserted = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const c of comments) {
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(c.project_id);
      if (!project) { skipped++; continue; }
      upsert.run({
        id: c.id, project_id: c.project_id, user_id: c.user_id || 1,
        content: c.content, source: c.source || 'text',
        original_language: c.original_language || null,
        raw_transcript: c.raw_transcript || null,
        title: c.title || null, audio_url: c.audio_url || null,
        content_cs: c.content_cs || null, content_en: c.content_en || null,
        content_de: c.content_de || null, content_tr: c.content_tr || null,
        created_at: c.created_at || null,
      });
      inserted++;
    }
  });
  tx();
  res.json({ inserted, skipped });
});

// POST /api/admin/translate-comments — translate all untranslated comments
router.post('/translate-comments', async (req, res) => {
  const untranslated = db.prepare(
    `SELECT id, content, original_language FROM comments WHERE content_cs IS NULL OR content_en IS NULL`
  ).all();

  res.json({ started: true, total: untranslated.length });

  for (const c of untranslated) {
    try {
      const t = await ai.translateComment(c.content, c.original_language || 'cs');
      db.prepare(`UPDATE comments SET content_cs=?, content_en=?, content_de=?, content_tr=? WHERE id=?`)
        .run(t.cs, t.en, t.de, t.tr, c.id);
      console.log(`Translated comment ${c.id}`);
    } catch (e) {
      console.error(`Failed comment ${c.id}:`, e.message);
    }
  }
  console.log('Bulk translation complete.');
});

// POST /api/admin/ai-assess-all — run AI win-probability assessment for every project missing it
router.post('/ai-assess-all', async (req, res) => {
  const missing = db.prepare(`SELECT id FROM projects WHERE win_prob_ai IS NULL`).all();

  res.json({ started: true, total: missing.length });

  for (const p of missing) {
    try {
      await autoAssess.runAssessment(p.id);
      console.log(`AI-assessed project ${p.id}`);
    } catch (e) {
      console.error(`AI assessment failed for project ${p.id}:`, e.message);
    }
  }
  console.log('Bulk AI assessment complete.');
});

// --- Backup / Snapshots (admin only) ---

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET /api/admin/backup/download — full JSON export
router.get('/backup/download', requireAdmin, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects').all();
  const comments = db.prepare('SELECT * FROM comments').all();
  const settings = db.prepare('SELECT key, value FROM app_settings').all();
  const now = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="minib-backup-${now}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json({ _exportedAt: new Date().toISOString(), projects, comments, settings });
});

// GET /api/admin/backup/export-csv — export current projects as CSV for Excel
router.get('/backup/export-csv', requireAdmin, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY project_code').all();
  const now = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="minib-projects-${now}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(generateCsv(projects));
});

// GET /api/admin/backup/snapshot/:id/csv — download CSV from a specific snapshot
router.get('/backup/snapshot/:id/csv', requireAdmin, (req, res) => {
  const snap = db.prepare('SELECT id, label, created_at, csv_data, projects_json FROM project_snapshots WHERE id = ?').get(req.params.id);
  if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
  const csv = snap.csv_data || generateCsv(JSON.parse(snap.projects_json));
  const date = snap.created_at.slice(0, 10);
  const safeName = snap.label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  res.setHeader('Content-Disposition', `attachment; filename="minib-${safeName}-${date}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});

// GET /api/admin/backup/snapshots — list snapshots
router.get('/backup/snapshots', requireAdmin, (req, res) => {
  const rows = db.prepare(
    'SELECT id, label, created_at, projects_json FROM project_snapshots ORDER BY created_at DESC LIMIT 60'
  ).all();
  const snapshots = rows.map(s => ({
    id: s.id,
    label: s.label,
    created_at: s.created_at,
    projects_count: JSON.parse(s.projects_json).length,
  }));
  res.json({ snapshots });
});

// POST /api/admin/backup/snapshot — create manual snapshot
router.post('/backup/snapshot', requireAdmin, (req, res) => {
  const { label } = req.body || {};
  const projects = db.prepare('SELECT * FROM projects').all();
  const comments = db.prepare('SELECT * FROM comments').all();
  const tag = (label || '').trim() || ('manual:' + new Date().toISOString().slice(0, 16));
  db.prepare("INSERT INTO project_snapshots (label, projects_json, comments_json, csv_data) VALUES (?, ?, ?, ?)")
    .run(tag, JSON.stringify(projects), JSON.stringify(comments), generateCsv(projects));
  res.json({ ok: true, label: tag, projects: projects.length });
});

// POST /api/admin/backup/restore/:id — restore from snapshot
router.post('/backup/restore/:id', requireAdmin, (req, res) => {
  const snap = db.prepare('SELECT * FROM project_snapshots WHERE id = ?').get(req.params.id);
  if (!snap) return res.status(404).json({ error: 'Snapshot not found' });

  const projects = JSON.parse(snap.projects_json);
  const comments = JSON.parse(snap.comments_json);

  db.transaction(() => {
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM projects').run();
    if (projects.length) {
      const cols = Object.keys(projects[0]);
      const stmt = db.prepare(`INSERT OR REPLACE INTO projects (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const p of projects) stmt.run(...cols.map(c => p[c] ?? null));
    }
    if (comments.length) {
      const cols = Object.keys(comments[0]);
      const stmt = db.prepare(`INSERT OR REPLACE INTO comments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const c of comments) stmt.run(...cols.map(col => c[col] ?? null));
    }
  })();

  res.json({ ok: true, restored: { projects: projects.length, comments: comments.length } });
});

// DELETE /api/admin/backup/snapshot/:id
router.delete('/backup/snapshot/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM project_snapshots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
