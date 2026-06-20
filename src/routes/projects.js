const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { dealerCanAccessProject } = require('../middleware/permissions');
const ai = require('../services/ai');

const router = express.Router();

const EDITABLE_FIELDS = [
  'project_name', 'company', 'client_name', 'investor', 'building_type', 'country', 'sheet', 'region',
  'general_contractor', 'installation_company',
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

  // MEA role sees only non-Tuzemsko projects
  if (req.user.role === 'MEA') {
    where.push("country NOT IN ('CZ', 'SK')");
  }

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
  const projects = db.prepare(sql).all(...params);
  res.json({ projects });
});

// GET /api/projects/meta - dropdown options
router.get('/meta', (req, res) => {
  const settings = db.prepare('SELECT key, value FROM app_settings').all();
  const meta = {};
  for (const s of settings) {
    try { meta[s.key] = JSON.parse(s.value); } catch (e) { meta[s.key] = s.value; }
  }
  const fixedOwners = ['Cem', 'Hakan', 'Ogün', 'Okan', 'Pavla', 'Petr', 'Roman', 'Sefa', 'jiný'];
  const dbOwners = db.prepare("SELECT DISTINCT owner FROM projects WHERE owner IS NOT NULL").all().map(r => r.owner);
  const owners = [...new Set([...fixedOwners, ...dbOwners])].sort();
  const dealers = db.prepare("SELECT id, name FROM users WHERE role = 'DEALER' AND is_active = 1 ORDER BY name").all();
  const dbCountries = db.prepare("SELECT DISTINCT country FROM projects WHERE country IS NOT NULL ORDER BY country").all().map(r => r.country);
  meta.owners = owners;
  meta.dealers = dealers;
  meta.countries = dbCountries;
  res.json(meta);
});

router.get('/export', async (req, res) => {
  const ExcelJS = require('exceljs');

  // Build query with same filters as the frontend passes via query params
  const { region, country, win, status, year, owner, search } = req.query;
  const TUZEMSKO = new Set(['CZ', 'SK']);
  const MEA = new Set(['TR','AZ','Az','GE','KZ','UZ','Mong','SY','IQ','TM','EG','MA','DZ','LY','TN','TZ','UG','KW','AE','OM','JO','NC','BY','RU']);

  const where = [];
  const params = [];
  applyDealerFilter(req, where, params);
  if (req.user.role === 'MEA') where.push("country NOT IN ('CZ','SK')");

  const allProjects = db.prepare(
    `SELECT * FROM projects ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`
  ).all(...params);

  // Apply frontend filters
  let projects = allProjects.filter(p => {
    if (region === 'tuzemsko' && !TUZEMSKO.has(p.country)) return false;
    if (region === 'mea'      && !MEA.has(p.country))      return false;
    if (region === 'zahranici' && (TUZEMSKO.has(p.country) || MEA.has(p.country))) return false;
    if (country && p.country !== country) return false;
    if (status  && p.status  !== status)  return false;
    if (owner   && p.owner   !== owner)   return false;
    if (year && !(p.estimated_decision_date && String(p.estimated_decision_date).includes(year))) return false;
    if (win) {
      const prob = p.win_prob_manual_min;
      if (win === 'none' && prob != null) return false;
      if (win === 'low'  && (prob == null || prob >= 30))  return false;
      if (win === 'mid'  && (prob == null || prob < 30 || prob >= 70)) return false;
      if (win === 'high' && (prob == null || prob < 70))  return false;
    }
    if (search) {
      const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      const hay = norm(`${p.project_name||''} ${p.company||''} ${p.country||''} ${p.owner||''}`);
      if (!hay.includes(norm(search))) return false;
    }
    return true;
  });

  // ── colours ────────────────────────────────────────────────────────────────
  const C_DARK   = 'FF3D3D3D';
  const C_YELLOW = 'FFFFC600';
  const C_WHITE  = 'FFFFFFFF';
  const C_GREY1  = 'FFF7F7F7';
  const C_BORDER = 'FFCCCCCC';
  const C_GREEN  = 'FF2E7D32';
  const C_RED    = 'FFC0272D';
  const C_MUTED  = 'FF9E9E9E';
  const C_BLUE   = 'FF1565C0';
  const C_ORANGE = 'FFE65100';
  const C_BG_TOT = 'FFFFF0B3';

  const STATUS_COLORS = { active: C_GREEN, won: C_GREEN, lost: C_RED, lead: C_MUTED, on_hold: C_ORANGE };
  const STATUS_LABELS = { lead:'Nabídka', active:'Aktivní', won:'Vyhráno', lost:'Prohráno', on_hold:'Pozastaveno' };
  const PHASE_LABELS  = { project_stage:'Projektová fáze', tender:'Tendr', order:'Objednávka', delivery:'Dodávka' };
  const REGION_LABELS = { '':'Vše', tuzemsko:'Tuzemsko', zahranici:'Zahraničí bez MEA', mea:'MEA' };
  const WIN_LABELS    = { '':'Vše', high:'≥ 70%', mid:'30–69%', low:'< 30%', none:'Bez hodnoty' };

  const COUNTRY_NAMES = { TR:'Turecko',AZ:'Ázerbájdžán',Az:'Ázerbájdžán',GE:'Gruzie',KZ:'Kazachstán',UZ:'Uzbekistán',Mong:'Mongolsko',CAN:'Kanada',CZ:'Česko',SK:'Slovensko',Německo:'Německo',Slovinsko:'Slovinsko',Srbsko:'Srbsko',Itálie:'Itálie',Rakousko:'Rakousko',Rumunsko:'Rumunsko',Francie:'Francie',USA:'USA',Řecko:'Řecko',Portugalsko:'Portugalsko',Kanada:'Kanada',Arménie:'Arménie' };
  const countryName = c => COUNTRY_NAMES[c] || c || '';

  const HEADERS = ['Název projektu','Klient','Země','EUR','CZK','Artikly a počty ks','AI hodnota EUR','Status','Fáze','Win% / AI%','Datum rozhodnutí','Datum realizace','Investor','Generální dodavatel','Montážní firma','Obchodník'];
  const COL_WIDTHS = [34,26,14,12,10,36,14,14,17,12,14,14,20,20,20,14];
  const NUM_COLS = new Set([3,4,6]); // 0-based

  function thinBorder(color) {
    const s = { style:'thin', color:{argb:color} };
    return { top:s, left:s, bottom:s, right:s };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MINIB Pipeline';
  const ws = wb.addWorksheet('Pipeline', { views:[{state:'frozen',ySplit:5}] });
  ws.properties.tabColor = { argb: C_YELLOW };

  // Column widths
  ws.columns = COL_WIDTHS.map(w => ({ width: w }));

  // Row 1: Title
  ws.addRow([]);
  const r1 = ws.lastRow;
  r1.height = 34;
  ws.mergeCells(`A1:P1`);
  const c1 = r1.getCell(1);
  c1.value = 'MINIB Project Pipeline';
  c1.font = { name:'Arial', bold:true, size:16, color:{argb:C_WHITE} };
  c1.fill = { type:'pattern', pattern:'solid', fgColor:{argb:C_DARK} };
  c1.alignment = { horizontal:'left', vertical:'middle', indent:1 };

  // Row 2: Yellow stripe
  ws.addRow([]);
  const r2 = ws.lastRow;
  r2.height = 5;
  ws.mergeCells(`A2:P2`);
  r2.getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:C_YELLOW} };

  // Row 3: Filter meta
  const filterParts = [
    `Region: ${REGION_LABELS[region||''] || 'Vše'}`,
    search  ? `Hledat: ${search}` : null,
    country ? `Země: ${countryName(country)}` : null,
    win     ? `Win%: ${WIN_LABELS[win]}` : null,
    status  ? `Status: ${STATUS_LABELS[status]||status}` : null,
    year    ? `Rok: ${year}` : null,
    owner   ? `Obchodník: ${owner}` : null,
  ].filter(Boolean).join('   |   ');
  const metaText = `Exportováno: ${new Date().toLocaleString('cs-CZ')}     Filtry: ${filterParts}     Počet řádků: ${projects.length}`;
  ws.addRow([]);
  const r3 = ws.lastRow;
  r3.height = 18;
  ws.mergeCells('A3:P3');
  const c3 = r3.getCell(1);
  c3.value = metaText;
  c3.font = { name:'Arial', size:9, italic:true, color:{argb:'FFAAAAAA'} };
  c3.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2A2A2A'} };
  c3.alignment = { horizontal:'left', vertical:'middle', indent:1 };

  // Row 4: Spacer
  ws.addRow([]);
  ws.lastRow.height = 6;

  // Row 5: Headers
  ws.addRow(HEADERS);
  const r5 = ws.lastRow;
  r5.height = 30;
  r5.eachCell((cell, ci) => {
    cell.font = { name:'Arial', bold:true, size:10, color:{argb:C_DARK} };
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:C_YELLOW} };
    cell.border = thinBorder(C_YELLOW);
    cell.alignment = { horizontal: NUM_COLS.has(ci-1) ? 'right' : 'center', vertical:'middle', wrapText:true };
  });

  // Data rows
  projects.forEach((p, i) => {
    const rowBg = i % 2 === 1 ? C_GREY1 : C_WHITE;
    const manual = p.win_prob_manual_min;
    const aiP    = p.win_prob_ai;
    let winVal = '';
    if (manual != null && aiP != null) winVal = `${manual}% / ${aiP}%`;
    else if (manual != null) winVal = `${manual}%`;
    else if (aiP != null) winVal = `${aiP}%`;

    const eur  = !TUZEMSKO.has(p.country) && p.project_value_eur != null ? p.project_value_eur : null;
    const czk  = TUZEMSKO.has(p.country) && p.project_value_eur != null ? p.project_value_eur : (p.project_value_local ?? null);
    const aiV  = p.project_value_eur == null && p.ai_value_eur != null ? p.ai_value_eur : null;

    const rowData = [
      p.project_name||'', p.company||'', countryName(p.country),
      eur, czk, p.products_and_quantity||'',
      aiV,
      STATUS_LABELS[p.status]||p.status||'',
      PHASE_LABELS[p.phase]||p.phase||'',
      winVal,
      p.estimated_decision_date ? String(p.estimated_decision_date).slice(0,7) : '',
      p.estimated_delivery_date ? String(p.estimated_delivery_date).slice(0,7) : '',
      p.investor||'', p.general_contractor||'', p.installation_company||'', p.owner||'',
    ];

    ws.addRow(rowData);
    const dr = ws.lastRow;
    dr.height = 20;

    dr.eachCell({ includeEmpty:true }, (cell, ci) => {
      const ci0 = ci - 1;
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:rowBg} };
      cell.border = thinBorder(C_BORDER);

      if (NUM_COLS.has(ci0)) {
        cell.font = { name:'Arial', size:10, color:{argb: ci0===6 ? C_BLUE : C_DARK} };
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal:'right', vertical:'middle' };
      } else if (ci0 === 7) {
        const statusColor = STATUS_COLORS[p.status] || C_MUTED;
        cell.font = { name:'Arial', size:10, bold:true, color:{argb:statusColor} };
        cell.alignment = { horizontal:'center', vertical:'middle' };
      } else if (ci0 === 15) {
        cell.font = { name:'Arial', size:10, bold:true, color:{argb:C_DARK} };
        cell.alignment = { horizontal:'left', vertical:'middle' };
      } else {
        cell.font = { name:'Arial', size:10, color:{argb:C_DARK} };
        cell.alignment = { horizontal:'left', vertical:'middle' };
      }
    });
  });

  // Totals row
  const dataStartRow = 6;
  const dataEndRow   = 5 + projects.length;
  const totRow = ws.addRow([`CELKEM  (${projects.length} projektů)`, ...Array(HEADERS.length-1).fill(null)]);
  totRow.height = 24;
  totRow.eachCell({ includeEmpty:true }, (cell, ci) => {
    const ci0 = ci - 1;
    cell.fill   = { type:'pattern', pattern:'solid', fgColor:{argb:C_BG_TOT} };
    cell.border = thinBorder(C_YELLOW);
    if (ci0 === 0) {
      cell.font = { name:'Arial', size:10, bold:true, color:{argb:C_DARK} };
      cell.alignment = { horizontal:'left', vertical:'middle' };
    } else if (NUM_COLS.has(ci0)) {
      const colLetter = ws.getColumn(ci).letter;
      cell.value = { formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` };
      cell.numFmt = '#,##0';
      cell.font = { name:'Arial', size:10, bold:true, color:{argb: ci0===6 ? C_BLUE : C_DARK} };
      cell.alignment = { horizontal:'right', vertical:'middle' };
    } else {
      cell.font = { name:'Arial', size:10, color:{argb:C_DARK} };
    }
  });

  // Auto-filter on header row
  ws.autoFilter = { from:'A5', to:`${ws.getColumn(HEADERS.length).letter}5` };

  // Page setup
  ws.pageSetup = { orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0 };
  ws.pageSetup.printTitlesRow = '1:5';

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const filename = `MINIB_Pipeline_${stamp}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
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
    investor: body.investor || null,
    building_type: body.building_type || null,
    general_contractor: body.general_contractor || null,
    installation_company: body.installation_company || null,
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

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'HQ') return res.status(403).json({ error: 'HQ only' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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
