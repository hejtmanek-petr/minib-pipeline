const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { dealerCanAccessProject } = require('../middleware/permissions');
const ai = require('../services/ai');

const router = express.Router();

const EDITABLE_FIELDS = [
  'project_name', 'company', 'client_name', 'building_type', 'country', 'sheet', 'region',
  'owner', 'status', 'phase', 'products_and_quantity', 'competition',
  'estimated_decision_date', 'estimated_delivery_date', 'actual_order_date',
  'current_status_note',
  'minib_price_eur', 'project_value_eur', 'currency', 'project_value_local', 'exchange_rate',
  'win_prob_manual_min', 'win_prob_manual_max', 'dealer_user_id',
];

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

// GET /api/projects - list with filters
router.get('/', (req, res) => {
  const { q, sheet, owner, status, decisionYear, sort, dir } = req.query;
  const where = [];
  const params = [];

  applyDealerFilter(req, where, params);

  if (q) {
    where.push('(project_name LIKE ? OR company LIKE ? OR country LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (sheet) {
    where.push('sheet = ?');
    params.push(sheet);
  }
  if (owner) {
    where.push('owner = ?');
    params.push(owner);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (decisionYear) {
    where.push("estimated_decision_date LIKE ?");
    params.push(`${decisionYear}%`);
  }

  const allowedSort = ['project_code', 'project_name', 'country', 'company', 'owner', 'phase', 'status', 'minib_price_eur', 'win_prob_manual_min', 'estimated_decision_date', 'created_at'];
  const sortCol = allowedSort.includes(sort) ? sort : 'id';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT * FROM projects ${whereSql} ORDER BY ${sortCol} ${sortDir}`;
  const rows = db.prepare(sql).all(...params);
  res.json({ projects: rows });
});

// GET /api/projects/meta - dropdown options
router.get('/meta', (req, res) => {
  const settings = db.prepare('SELECT key, value FROM app_settings').all();
  const meta = {};
  for (const s of settings) {
    try { meta[s.key] = JSON.parse(s.value); } catch (e) { meta[s.key] = s.value; }
  }
  const owners = db.prepare("SELECT DISTINCT owner FROM projects WHERE owner IS NOT NULL ORDER BY owner").all().map(r => r.owner);
  const dealers = db.prepare("SELECT id, name FROM users WHERE role = 'DEALER' AND is_active = 1 ORDER BY name").all();
  meta.owners = owners;
  meta.dealers = dealers;
  res.json(meta);
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });
  res.json({ project });
});

// POST /api/projects - create new
router.post('/', (req, res) => {
  const body = req.body || {};
  const sheet = body.sheet || 'TR';
  const year = new Date().getFullYear();
  const countRow = db.prepare("SELECT COUNT(*) AS c FROM projects WHERE sheet = ?").get(sheet);
  const seq = countRow.c + 1;
  const project_code = body.project_code || `${sheet}-${year}-${String(seq).padStart(3, '0')}`;

  const fields = {
    project_code,
    sheet,
    country: body.country || null,
    region: body.region || (sheet === 'TR' ? 'Turkey' : 'CIS'),
    project_name: body.project_name || null,
    company: body.company || null,
    client_name: body.client_name || null,
    building_type: body.building_type || null,
    minib_price_eur: body.minib_price_eur ?? null,
    project_value_eur: body.project_value_eur ?? null,
    currency: body.currency || 'EUR',
    project_value_local: body.project_value_local ?? null,
    exchange_rate: body.exchange_rate ?? null,
    products_and_quantity: body.products_and_quantity || null,
    competition: body.competition || null,
    estimated_decision_date: body.estimated_decision_date || null,
    estimated_delivery_date: body.estimated_delivery_date || null,
    actual_order_date: body.actual_order_date || null,
    status: body.status || 'lead',
    phase: body.phase || 'project_stage',
    current_status_note: body.current_status_note || null,
    owner: body.owner || null,
    dealer_user_id: body.dealer_user_id || null,
    win_prob_manual_min: body.win_prob_manual_min ?? null,
    win_prob_manual_max: body.win_prob_manual_max ?? null,
    created_by_user_id: req.user.id,
  };

  const columns = Object.keys(fields);
  const placeholders = columns.map((c) => `@${c}`).join(', ');
  const sql = `INSERT INTO projects (${columns.join(', ')}) VALUES (${placeholders})`;
  const info = db.prepare(sql).run(fields);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ project });
});

// PUT /api/projects/:id - update with history tracking
router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const body = req.body || {};
  const updates = {};
  const historyInsert = db.prepare(`
    INSERT INTO project_history (project_id, user_id, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const field of EDITABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const newValue = body[field];
      const oldValue = project[field];
      const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
      const newStr = newValue === null || newValue === undefined ? '' : String(newValue);
      if (oldStr === newStr) continue;

      updates[field] = newValue;
      historyInsert.run(project.id, req.user.id, field, oldValue, newValue);
    }

    if (Object.keys(updates).length > 0) {
      const setSql = Object.keys(updates).map((f) => `${f} = @${f}`).join(', ');
      db.prepare(`UPDATE projects SET ${setSql}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id: project.id });
    }
  });
  tx();

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  res.json({ project: updated });
});

// GET /api/projects/:id/history
router.get('/:id/history', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const rows = db.prepare(`
    SELECT h.*, u.name AS user_name
    FROM project_history h
    JOIN users u ON u.id = h.user_id
    WHERE h.project_id = ?
    ORDER BY h.changed_at DESC, h.id DESC
  `).all(project.id);
  res.json({ history: rows });
});

// --- Product lines ---

router.get('/:id/products', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const rows = db.prepare('SELECT * FROM product_lines WHERE project_id = ? ORDER BY position, id').all(project.id);
  res.json({ products: rows });
});

router.post('/:id/products', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const { model, quantity, unit_price_eur } = req.body || {};
  const total_price_eur = (Number(quantity) || 0) * (Number(unit_price_eur) || 0);
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM product_lines WHERE project_id = ?').get(project.id).m;

  const info = db.prepare(`
    INSERT INTO product_lines (project_id, model, quantity, unit_price_eur, total_price_eur, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(project.id, model || null, quantity ?? null, unit_price_eur ?? null, total_price_eur, maxPos + 1);

  const row = db.prepare('SELECT * FROM product_lines WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ product: row });
});

router.put('/:id/products/:productId', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const existing = db.prepare('SELECT * FROM product_lines WHERE id = ? AND project_id = ?').get(req.params.productId, project.id);
  if (!existing) return res.status(404).json({ error: 'Product line not found' });

  const { model, quantity, unit_price_eur } = req.body || {};
  const newModel = model !== undefined ? model : existing.model;
  const newQty = quantity !== undefined ? quantity : existing.quantity;
  const newPrice = unit_price_eur !== undefined ? unit_price_eur : existing.unit_price_eur;
  const total_price_eur = (Number(newQty) || 0) * (Number(newPrice) || 0);

  db.prepare(`
    UPDATE product_lines SET model = ?, quantity = ?, unit_price_eur = ?, total_price_eur = ? WHERE id = ?
  `).run(newModel, newQty, newPrice, total_price_eur, existing.id);

  const row = db.prepare('SELECT * FROM product_lines WHERE id = ?').get(existing.id);
  res.json({ product: row });
});

router.delete('/:id/products/:productId', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  db.prepare('DELETE FROM product_lines WHERE id = ? AND project_id = ?').run(req.params.productId, project.id);
  res.json({ ok: true });
});

// --- AI win-probability assessment ---

router.post('/:id/ai-assess', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const lang = (req.body && req.body.lang) || req.user.preferred_language || 'en';

  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.project_id = ?
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all(project.id);

  try {
    const result = await ai.assessWinProbability(project, comments, lang);

    db.prepare(`
      UPDATE projects SET
        win_prob_ai = ?, win_prob_ai_min = ?, win_prob_ai_max = ?,
        win_prob_ai_reasoning = ?, win_prob_ai_updated_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      result.probability ?? null,
      result.probability_min ?? null,
      result.probability_max ?? null,
      result.reasoning ?? null,
      project.id
    );

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    res.json({ project: updated });
  } catch (err) {
    console.error('AI assessment failed:', err.message);
    res.status(503).json({ error: 'AI assessment is currently unavailable' });
  }
});

// --- Excel import ---

// POST /api/projects/import/preview - parse uploaded base64 xlsx, return rows
router.post('/import/preview', (req, res) => {
  const { fileBase64 } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

  try {
    const buf = Buffer.from(fileBase64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const result = {};
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      result[sheetName] = rows;
    }
    res.json({ sheets: result });
  } catch (err) {
    res.status(400).json({ error: 'Could not parse Excel file: ' + err.message });
  }
});

// POST /api/projects/import/commit - insert selected rows
router.post('/import/commit', (req, res) => {
  const { rows, sheet } = req.body || {};
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array is required' });

  const sheetName = sheet || 'TR';
  const year = new Date().getFullYear();
  let countRow = db.prepare("SELECT COUNT(*) AS c FROM projects WHERE sheet = ?").get(sheetName);
  let seq = countRow.c;

  const insert = db.prepare(`
    INSERT INTO projects (
      project_code, sheet, country, region, project_name, company,
      products_and_quantity, competition, estimated_decision_date, estimated_delivery_date,
      owner, current_status_note, minib_price_eur, win_prob_manual_min, win_prob_manual_max,
      status, phase, created_by_user_id
    ) VALUES (
      @project_code, @sheet, @country, @region, @project_name, @company,
      @products_and_quantity, @competition, @estimated_decision_date, @estimated_delivery_date,
      @owner, @current_status_note, @minib_price_eur, @win_prob_manual_min, @win_prob_manual_max,
      'lead', 'project_stage', @created_by_user_id
    )
  `);

  const inserted = [];
  const tx = db.transaction(() => {
    for (const row of rows) {
      seq += 1;
      const project_code = `${sheetName}-${year}-${String(seq).padStart(3, '0')}`;
      const probability = row['Probability of winning'];
      let prob = null;
      if (typeof probability === 'number') {
        prob = probability <= 1 ? Math.round(probability * 100) : Math.round(probability);
      }
      const info = insert.run({
        project_code,
        sheet: sheetName,
        country: row['Country'] || null,
        region: sheetName === 'TR' ? 'Turkey' : 'CIS',
        project_name: row['Name of project'] || null,
        company: row['Company'] || null,
        products_and_quantity: row['Products and quantity'] || null,
        competition: row['Brands in project / competition'] || null,
        estimated_decision_date: row['Estimated day of decision (order, tender)'] ? String(row['Estimated day of decision (order, tender)']) : null,
        estimated_delivery_date: row['Estimated day of realisation (delivery)'] ? String(row['Estimated day of realisation (delivery)']) : null,
        owner: row['Owner'] || null,
        current_status_note: row['Current Status'] || row['Comment'] || null,
        minib_price_eur: typeof row['Minib Price'] === 'number' ? row['Minib Price'] : null,
        win_prob_manual_min: prob,
        win_prob_manual_max: prob,
        created_by_user_id: req.user.id,
      });
      inserted.push(info.lastInsertRowid);
    }
  });
  tx();

  res.status(201).json({ inserted: inserted.length, ids: inserted });
});

module.exports = router;
