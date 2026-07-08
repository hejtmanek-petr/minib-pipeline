const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ALLOWED_TRENDS = ['growing', 'stable', 'declining'];
const ALLOWED_CONTACTS = ['low', 'medium', 'high'];

function withParsedOwners(report) {
  if (!report) return report;
  let owners = [];
  try { owners = report.responsible_owners ? JSON.parse(report.responsible_owners) : []; } catch (e) { owners = []; }
  return { ...report, responsible_owners: owners };
}

// GET /api/country-reports/overview
// One row per MEA country: pipeline stats + latest report snapshot + report count
router.get('/overview', (req, res) => {
  const settingsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'countries'").get();
  const countries = settingsRow ? JSON.parse(settingsRow.value) : [];

  const projects = db.prepare('SELECT country, project_value_eur, win_prob_manual_min, win_prob_ai, status FROM projects').all();
  const latestStmt = db.prepare(`
    SELECT cr.*, u.name AS user_name
    FROM country_reports cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.country = ?
    ORDER BY cr.created_at DESC, cr.id DESC
    LIMIT 1
  `);
  const countStmt = db.prepare('SELECT COUNT(*) AS c FROM country_reports WHERE country = ?');

  const stats = countries.map((code) => {
    const inCountry = projects.filter((p) => p.country === code);
    const activeInCountry = inCountry.filter((p) => p.status === 'active');
    const value = activeInCountry.reduce((s, p) => s + (p.project_value_eur || 0), 0);
    const withProb = activeInCountry.filter((p) => p.win_prob_manual_min != null);
    const avgProb = withProb.length ? Math.round(withProb.reduce((s, p) => s + p.win_prob_manual_min, 0) / withProb.length) : null;
    const withAi = activeInCountry.filter((p) => p.win_prob_ai != null);
    const avgAi = withAi.length ? Math.round(withAi.reduce((s, p) => s + p.win_prob_ai, 0) / withAi.length) : null;

    const latest = withParsedOwners(latestStmt.get(code) || null);
    const reportCount = countStmt.get(code).c;

    return {
      code,
      project_count: inCountry.length,
      active_count: activeInCountry.length,
      pipeline_value_eur: value,
      avg_win_prob: avgProb,
      avg_ai_prob: avgAi,
      latest,
      report_count: reportCount,
    };
  });

  // Opportunity score: blends the reported trend/contacts with the actual
  // pipeline size and win probability, so the ranking reflects both "what
  // people say" and "what the numbers show".
  const maxValue = Math.max(1, ...stats.map((s) => s.pipeline_value_eur));
  const TREND_SCORE = { growing: 1, stable: 0, declining: -1 };
  const CONTACTS_SCORE = { high: 1, medium: 0, low: -1 };

  const result = stats.map((s) => {
    const trendScore = s.latest && s.latest.trend ? TREND_SCORE[s.latest.trend] : 0;
    const contactsScore = s.latest && s.latest.contacts_level ? CONTACTS_SCORE[s.latest.contacts_level] : 0;
    const pipelineNorm = s.pipeline_value_eur / maxValue;
    const winNorm = s.avg_win_prob != null ? s.avg_win_prob / 100 : 0;
    const score = Math.round((trendScore * 3 + contactsScore * 2 + pipelineNorm * 3 + winNorm * 2) * 10) / 10;
    return { ...s, score };
  });

  res.json({ countries: result });
});

// GET /api/country-reports/:country — full report history for one country
router.get('/:country', (req, res) => {
  const reports = db.prepare(`
    SELECT cr.*, u.name AS user_name
    FROM country_reports cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.country = ?
    ORDER BY cr.created_at DESC, cr.id DESC
  `).all(req.params.country).map(withParsedOwners);
  res.json({ reports });
});

// POST /api/country-reports/:country — add a new report entry
router.post('/:country', (req, res) => {
  const { trend, contacts_level, political_situation, economic_situation, note, responsible_owners } = req.body || {};

  if (trend && !ALLOWED_TRENDS.includes(trend)) return res.status(400).json({ error: 'Invalid trend' });
  if (contacts_level && !ALLOWED_CONTACTS.includes(contacts_level)) return res.status(400).json({ error: 'Invalid contacts_level' });
  if (responsible_owners !== undefined && !Array.isArray(responsible_owners)) {
    return res.status(400).json({ error: 'responsible_owners must be an array' });
  }
  const owners = Array.isArray(responsible_owners) ? responsible_owners.filter((o) => typeof o === 'string' && o.trim()) : [];
  if (!trend && !contacts_level && !political_situation && !economic_situation && !note && !owners.length) {
    return res.status(400).json({ error: 'At least one field is required' });
  }

  const info = db.prepare(`
    INSERT INTO country_reports (country, user_id, trend, contacts_level, political_situation, economic_situation, note, responsible_owners)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.country,
    req.user.id,
    trend || null,
    contacts_level || null,
    political_situation || null,
    economic_situation || null,
    note || null,
    owners.length ? JSON.stringify(owners) : null
  );

  const report = withParsedOwners(db.prepare(`
    SELECT cr.*, u.name AS user_name FROM country_reports cr JOIN users u ON u.id = cr.user_id WHERE cr.id = ?
  `).get(info.lastInsertRowid));

  res.status(201).json({ report });
});

// DELETE /api/country-reports/entry/:id — admin only, fix a mistaken entry
router.delete('/entry/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM country_reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
