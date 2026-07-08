const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireNonSales } = require('../middleware/permissions');

const router = express.Router();
router.use(requireAuth);
router.use(requireNonSales);

const COUNTRY_NAMES = { TR:'Türkiye',AZ:'Azerbaijan',UZ:'Uzbekistan',KZ:'Kazakhstan',GE:'Georgia',SY:'Syria',IQ:'Iraq',TM:'Turkmenistan',MN:'Mongolia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',LY:'Libya',TN:'Tunisia',TZ:'Tanzania',UG:'Uganda',KW:'Kuwait',AE:'UAE',OM:'Oman',JO:'Jordan',NC:'Northern Cyprus',BY:'Belarus',RU:'Russia',CA:'Canada' };

function buildFilters(req) {
  const { owner, status, country, year, dateFrom, dateTo } = req.query;
  const where = [];
  const params = [];
  if (owner) { where.push('owner = ?'); params.push(owner); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (country) { where.push('country = ?'); params.push(country); }
  if (year) { where.push("estimated_decision_date LIKE ?"); params.push(year + '%'); }
  if (dateFrom) { where.push("estimated_decision_date >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("estimated_decision_date <= ?"); params.push(dateTo + '-99'); }
  return { where, params };
}

function getProjects(req) {
  const { where, params } = buildFilters(req);
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM projects ${sql}`).all(...params);
}

// Pipeline by phase
router.get('/pipeline', (req, res) => {
  const projects = getProjects(req);
  const phases = ['project_stage', 'tender', 'order', 'delivery'];
  const groups = phases.map(phase => {
    const items = projects.filter(p => (p.phase || 'project_stage') === phase);
    return { phase, count: items.length, value: items.reduce((s, p) => s + (p.project_value_eur || 0), 0) };
  });
  res.json({ groups, total: projects.length });
});

// Win/Loss
router.get('/winloss', (req, res) => {
  const projects = getProjects(req);
  const counts = { active: 0, won: 0, lost: 0 };
  for (const p of projects) counts[p.status] = (counts[p.status] || 0) + 1;
  const withProb = projects.filter(p => p.win_prob_manual_min != null);
  const avgProb = withProb.length ? withProb.reduce((s, p) => s + p.win_prob_manual_min, 0) / withProb.length : null;
  const withAiProb = projects.filter(p => p.win_prob_ai != null);
  const avgAiProb = withAiProb.length ? withAiProb.reduce((s, p) => s + p.win_prob_ai, 0) / withAiProb.length : null;
  const wonValue = projects.filter(p => p.status === 'won').reduce((s, p) => s + (p.project_value_eur || 0), 0);
  const lostValue = projects.filter(p => p.status === 'lost').reduce((s, p) => s + (p.project_value_eur || 0), 0);
  const activeValue = projects.filter(p => p.status === 'active').reduce((s, p) => s + (p.project_value_eur || 0), 0);
  res.json({ counts, avg_win_probability: avgProb, avg_ai_probability: avgAiProb, total: projects.length, wonValue, lostValue, activeValue });
});

// Geography
router.get('/geography', (req, res) => {
  const projects = getProjects(req);
  const byCountry = {};
  for (const p of projects) {
    const c = p.country || 'Unknown';
    if (!byCountry[c]) byCountry[c] = { code: c, name: COUNTRY_NAMES[c] || c, count: 0, value: 0, won: 0, lost: 0, probs: [], aiProbs: [] };
    byCountry[c].count++;
    byCountry[c].value += p.project_value_eur || 0;
    if (p.status === 'won') byCountry[c].won++;
    if (p.status === 'lost') byCountry[c].lost++;
    if (p.win_prob_manual_min != null) byCountry[c].probs.push(p.win_prob_manual_min);
    if (p.win_prob_ai != null) byCountry[c].aiProbs.push(p.win_prob_ai);
  }
  const result = Object.values(byCountry).map(c => ({
    ...c, avg_prob: c.probs.length ? Math.round(c.probs.reduce((a, b) => a + b, 0) / c.probs.length) : null,
    avg_ai_prob: c.aiProbs.length ? Math.round(c.aiProbs.reduce((a, b) => a + b, 0) / c.aiProbs.length) : null,
    win_rate: (c.won + c.lost) > 0 ? Math.round(c.won / (c.won + c.lost) * 100) : null,
  })).sort((a, b) => b.value - a.value);
  res.json({ countries: result });
});

// Owners
router.get('/owners', (req, res) => {
  const projects = getProjects(req);
  const byOwner = {};
  for (const p of projects) {
    const o = p.owner || 'Unassigned';
    if (!byOwner[o]) byOwner[o] = { owner: o, count: 0, value: 0, won: 0, lost: 0, active: 0, probs: [], aiProbs: [] };
    byOwner[o].count++;
    byOwner[o].value += p.project_value_eur || 0;
    if (p.status === 'won') byOwner[o].won++;
    if (p.status === 'lost') byOwner[o].lost++;
    if (p.status === 'active') byOwner[o].active++;
    if (p.win_prob_manual_min != null) byOwner[o].probs.push(p.win_prob_manual_min);
    if (p.win_prob_ai != null) byOwner[o].aiProbs.push(p.win_prob_ai);
  }
  const result = Object.values(byOwner).map(o => ({
    ...o, avg_prob: o.probs.length ? Math.round(o.probs.reduce((a, b) => a + b, 0) / o.probs.length) : null,
    avg_ai_prob: o.aiProbs.length ? Math.round(o.aiProbs.reduce((a, b) => a + b, 0) / o.aiProbs.length) : null,
    win_rate: (o.won + o.lost) > 0 ? Math.round(o.won / (o.won + o.lost) * 100) : null,
  })).sort((a, b) => b.value - a.value);
  res.json({ owners: result });
});

// Timeline
router.get('/timeline', (req, res) => {
  const projects = getProjects(req);
  const today = new Date().toISOString().slice(0, 7);
  const buckets = {};
  const overdue = [];
  for (const p of projects) {
    const d = p.estimated_decision_date;
    let bucket = 'Unknown';
    if (d) {
      const m = String(d).match(/^(\d{4})-(\d{2})/);
      if (m) {
        bucket = `${m[1]}-${m[2]}`;
        if (bucket < today && p.status === 'active') overdue.push(p);
      }
    }
    if (!buckets[bucket]) buckets[bucket] = { period: bucket, count: 0, value: 0, won: 0 };
    buckets[bucket].count++;
    buckets[bucket].value += p.project_value_eur || 0;
    if (p.status === 'won') buckets[bucket].won++;
  }
  res.json({
    timeline: Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)),
    overdue: overdue.map(p => ({ id: p.id, project_code: p.project_code, project_name: p.project_name, estimated_decision_date: p.estimated_decision_date, owner: p.owner })),
  });
});

// Forecast — weighted pipeline
router.get('/forecast', (req, res) => {
  const projects = getProjects(req).filter(p => p.status === 'active');
  const byMonth = {};
  for (const p of projects) {
    const d = p.estimated_decision_date;
    const month = d ? String(d).slice(0, 7) : 'Unknown';
    if (!byMonth[month]) byMonth[month] = { month, value: 0, weighted: 0, count: 0 };
    const val = p.project_value_eur || 0;
    const prob = p.win_prob_manual_min ?? p.win_prob_ai ?? 50;
    byMonth[month].value += val;
    byMonth[month].weighted += val * prob / 100;
    byMonth[month].count++;
  }
  res.json({ forecast: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)) });
});

// Activity
router.get('/activity', (req, res) => {
  const projects = getProjects(req);
  const ids = projects.map(p => p.id);
  if (!ids.length) return res.json({ monthly: [], stale: [] });

  const comments = db.prepare(`SELECT project_id, created_at FROM comments WHERE project_id IN (${ids.join(',')})`).all();
  const byMonth = {};
  for (const c of comments) {
    const m = c.created_at ? c.created_at.slice(0, 7) : 'Unknown';
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  const monthly = Object.entries(byMonth).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const lastCommentByProject = {};
  for (const c of comments) {
    if (!lastCommentByProject[c.project_id] || c.created_at > lastCommentByProject[c.project_id]) {
      lastCommentByProject[c.project_id] = c.created_at;
    }
  }
  const stale = projects.filter(p => p.status === 'active' && (!lastCommentByProject[p.id] || lastCommentByProject[p.id] < thirtyDaysAgo))
    .map(p => ({ id: p.id, project_code: p.project_code, project_name: p.project_name, owner: p.owner, last_comment: lastCommentByProject[p.id] || null }));

  res.json({ monthly, stale });
});

module.exports = router;
