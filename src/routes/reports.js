const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function applyDealerFilter(req, where, params) {
  if (req.user.role === 'HQ') return;
  let countries = [];
  try {
    countries = JSON.parse(req.user.countries || '[]');
  } catch (e) { /* ignore */ }

  const clauses = ['dealer_user_id = ?'];
  params.push(req.user.id);
  if (countries.length) {
    clauses.push(`country IN (${countries.map(() => '?').join(',')})`);
    params.push(...countries);
  }
  where.push(`(${clauses.join(' OR ')})`);
}

function buildFilters(req) {
  const { sheet, owner, status, region, dateFrom, dateTo } = req.query;
  const where = [];
  const params = [];

  applyDealerFilter(req, where, params);

  if (sheet) { where.push('sheet = ?'); params.push(sheet); }
  if (owner) { where.push('owner = ?'); params.push(owner); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (region) { where.push('region = ?'); params.push(region); }
  if (dateFrom) { where.push("estimated_decision_date >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("estimated_decision_date <= ?"); params.push(dateTo); }

  return { where, params };
}

function getProjects(req) {
  const { where, params } = buildFilters(req);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM projects ${whereSql}`).all(...params);
}

// Report 1: Pipeline overview, grouped by phase
router.get('/pipeline', (req, res) => {
  const projects = getProjects(req);
  const phases = ['project_stage', 'tender', 'order', 'delivery'];
  const groups = phases.map((phase) => {
    const items = projects.filter((p) => (p.phase || 'project_stage') === phase);
    return {
      phase,
      count: items.length,
      total_value_eur: items.reduce((sum, p) => sum + (p.minib_price_eur || 0), 0),
    };
  });
  res.json({ groups, total: projects.length });
});

// Report 2: Win/Loss analysis
router.get('/winloss', (req, res) => {
  const projects = getProjects(req);
  const statuses = ['lead', 'active', 'won', 'lost', 'on_hold'];
  const counts = {};
  for (const s of statuses) counts[s] = 0;
  for (const p of projects) {
    counts[p.status] = (counts[p.status] || 0) + 1;
  }

  const withProb = projects.filter((p) => p.win_prob_manual_min !== null && p.win_prob_manual_min !== undefined);
  const avgWinProb = withProb.length
    ? withProb.reduce((sum, p) => sum + p.win_prob_manual_min, 0) / withProb.length
    : null;

  res.json({ counts, avg_win_probability: avgWinProb, total: projects.length });
});

// Report 3: Geographic overview
router.get('/geography', (req, res) => {
  const projects = getProjects(req);
  const byCountry = {};
  for (const p of projects) {
    const c = p.country || 'Unknown';
    if (!byCountry[c]) byCountry[c] = { country: c, count: 0, total_value_eur: 0, probs: [] };
    byCountry[c].count += 1;
    byCountry[c].total_value_eur += p.minib_price_eur || 0;
    if (p.win_prob_manual_min !== null && p.win_prob_manual_min !== undefined) {
      byCountry[c].probs.push(p.win_prob_manual_min);
    }
  }
  const result = Object.values(byCountry).map((c) => ({
    country: c.country,
    count: c.count,
    total_value_eur: c.total_value_eur,
    avg_win_probability: c.probs.length ? c.probs.reduce((a, b) => a + b, 0) / c.probs.length : null,
  })).sort((a, b) => b.total_value_eur - a.total_value_eur);

  res.json({ countries: result });
});

// Report 4: Owner performance
router.get('/owners', (req, res) => {
  const projects = getProjects(req);
  const byOwner = {};
  for (const p of projects) {
    const o = p.owner || 'Unassigned';
    if (!byOwner[o]) byOwner[o] = { owner: o, count: 0, total_value_eur: 0, probs: [], won: 0, lost: 0 };
    byOwner[o].count += 1;
    byOwner[o].total_value_eur += p.minib_price_eur || 0;
    if (p.win_prob_manual_min !== null && p.win_prob_manual_min !== undefined) {
      byOwner[o].probs.push(p.win_prob_manual_min);
    }
    if (p.status === 'won') byOwner[o].won += 1;
    if (p.status === 'lost') byOwner[o].lost += 1;
  }
  const result = Object.values(byOwner).map((o) => ({
    owner: o.owner,
    count: o.count,
    total_value_eur: o.total_value_eur,
    avg_win_probability: o.probs.length ? o.probs.reduce((a, b) => a + b, 0) / o.probs.length : null,
    won: o.won,
    lost: o.lost,
  })).sort((a, b) => b.total_value_eur - a.total_value_eur);

  res.json({ owners: result });
});

// Report 5: Order timeline (by month/quarter from estimated_decision_date)
router.get('/timeline', (req, res) => {
  const projects = getProjects(req);
  const today = new Date().toISOString().slice(0, 10);

  const buckets = {};
  const overdue = [];

  for (const p of projects) {
    const d = p.estimated_decision_date;
    let bucket = 'Unknown';
    if (d) {
      const isoMatch = String(d).match(/^(\d{4})-(\d{2})/);
      const quarterMatch = String(d).match(/(\d{4}).*?Q([1-4])|Q([1-4]).*?(\d{4})/i);
      if (isoMatch) {
        bucket = `${isoMatch[1]}-${isoMatch[2]}`;
        if (d < today && (p.status === 'active' || p.status === 'lead')) {
          overdue.push(p);
        }
      } else if (quarterMatch) {
        const year = quarterMatch[1] || quarterMatch[4];
        const q = quarterMatch[2] || quarterMatch[3];
        bucket = `${year}-Q${q}`;
      } else {
        bucket = String(d);
      }
    }
    if (!buckets[bucket]) buckets[bucket] = { period: bucket, count: 0, total_value_eur: 0 };
    buckets[bucket].count += 1;
    buckets[bucket].total_value_eur += p.minib_price_eur || 0;
  }

  const result = Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period));
  res.json({
    timeline: result,
    overdue: overdue.map((p) => ({
      id: p.id, project_code: p.project_code, project_name: p.project_name,
      estimated_decision_date: p.estimated_decision_date, status: p.status, owner: p.owner,
    })),
  });
});

// Report 6: Pipeline value by region
router.get('/pipeline-value', (req, res) => {
  const projects = getProjects(req).filter((p) => p.status === 'active' || p.status === 'lead');
  const byRegion = {};
  for (const p of projects) {
    const r = p.region || 'Unknown';
    if (!byRegion[r]) byRegion[r] = { region: r, count: 0, total_value_eur: 0, projects_without_price: 0 };
    byRegion[r].count += 1;
    if (p.minib_price_eur === null || p.minib_price_eur === undefined) {
      byRegion[r].projects_without_price += 1;
    } else {
      byRegion[r].total_value_eur += p.minib_price_eur;
    }
  }
  res.json({ regions: Object.values(byRegion) });
});

// Export endpoint - dumps the (filtered) project list as CSV or XLSX
router.get('/export', (req, res) => {
  const projects = getProjects(req);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';

  const rows = projects.map((p) => ({
    'Project Code': p.project_code,
    'Sheet': p.sheet,
    'Country': p.country,
    'Region': p.region,
    'Project Name': p.project_name,
    'Company': p.company,
    'Owner': p.owner,
    'Status': p.status,
    'Phase': p.phase,
    'MINIB Price EUR': p.minib_price_eur,
    'Win % (min)': p.win_prob_manual_min,
    'Win % (max)': p.win_prob_manual_max,
    'AI Win %': p.win_prob_ai,
    'Estimated Decision Date': p.estimated_decision_date,
    'Estimated Delivery Date': p.estimated_delivery_date,
    'Products and Quantity': p.products_and_quantity,
    'Competition': p.competition,
    'Status Note': p.current_status_note,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Projects');

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="minib-projects.csv"');
    res.send(csv);
  } else {
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="minib-projects.xlsx"');
    res.send(buf);
  }
});

module.exports = router;
