/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const db = require('../src/db');

const EXCEL_PATH = path.join(__dirname, '..', '..', 'open projects-MEA-2026-04-08.xlsx');

const OWNER_EMAIL_MAP = {
  hakan: 'hakan@minib.cz',
  ogun: 'ogun@minib.cz',
  ogün: 'ogun@minib.cz',
  cem: 'cem@minib.cz',
  sefa: 'sefa@minib.cz',
};

const USERS = [
  { email: 'admin@minib.cz', password: 'Admin123!', name: 'Admin', role: 'HQ', preferred_language: 'en', countries: null },
  { email: 'hakan@minib.cz', password: 'Dealer123!', name: 'Hakan', role: 'DEALER', preferred_language: 'en', countries: ['TR', 'AZ'] },
  { email: 'cem@minib.cz', password: 'Dealer123!', name: 'Cem', role: 'DEALER', preferred_language: 'en', countries: ['GE', 'Mong', 'Az'] },
  { email: 'sefa@minib.cz', password: 'Dealer123!', name: 'Sefa', role: 'DEALER', preferred_language: 'en', countries: ['TR'] },
  { email: 'ogun@minib.cz', password: 'Dealer123!', name: 'Ogün', role: 'DEALER', preferred_language: 'en', countries: ['TR'] },
];

function excelSerialToISODate(serial) {
  // Excel date epoch: 1899-12-30
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeDateField(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value > 10000) return excelSerialToISODate(value);
    return String(value); // e.g. 2027 (a bare year)
  }
  return String(value).trim();
}

function normalizeProbability(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value <= 1) return Math.round(value * 100);
    return Math.round(value);
  }
  return null; // '?' or text
}

function derivePhase(statusNote) {
  if (!statusNote) return 'project_stage';
  const s = String(statusNote).toLowerCase();
  if (s.includes('tender')) return 'tender';
  if (s.includes('order') || s.includes('confirmation') || s.includes('payment') || s.includes('production')) return 'order';
  if (s.includes('deliver')) return 'delivery';
  return 'project_stage';
}

function ownerEmail(owner) {
  if (!owner) return null;
  const key = String(owner).trim().toLowerCase();
  return OWNER_EMAIL_MAP[key] || null;
}

function regionForSheet(sheet) {
  return sheet === 'TR' ? 'Turkey' : 'CIS';
}

function parseSheetRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Row 0 is empty, row 1 is the header, data starts at row 2
  const dataRows = rows.slice(2);
  const projects = [];

  for (const row of dataRows) {
    const [
      country,
      projectName,
      company,
      probability,
      decisionDate,
      productsAndQuantity,
      competition,
      deliveryDate,
      owner,
      colJ, // TR: "Current Status"; CIS: "Comment"
      colK, // TR: "Comments"; CIS: "Minib Price"
      colL, // TR: "Minib Price"; CIS: undefined
    ] = row;

    // Skip fully empty rows
    if (!country && !projectName && !company) continue;

    let currentStatusNote;
    let extraComment;
    let minibPrice;

    if (sheetName === 'TR') {
      currentStatusNote = colJ;
      extraComment = colK;
      minibPrice = colL;
    } else {
      currentStatusNote = colJ;
      extraComment = null;
      minibPrice = colK;
    }

    if (typeof minibPrice !== 'number') minibPrice = null;

    const probabilityPct = normalizeProbability(probability);

    projects.push({
      sheet: sheetName,
      country: country ? String(country).trim() : null,
      region: regionForSheet(sheetName),
      project_name: projectName ? String(projectName).trim() : null,
      company: company ? String(company).trim() : null,
      products_and_quantity: productsAndQuantity ? String(productsAndQuantity).trim() : null,
      competition: competition ? String(competition).trim() : null,
      estimated_decision_date: normalizeDateField(decisionDate),
      estimated_delivery_date: normalizeDateField(deliveryDate),
      owner: owner ? String(owner).trim() : null,
      current_status_note: currentStatusNote ? String(currentStatusNote).trim() : null,
      phase: derivePhase(currentStatusNote),
      minib_price_eur: minibPrice,
      win_prob_manual_min: probabilityPct,
      win_prob_manual_max: probabilityPct,
      extra_comment: extraComment ? String(extraComment).trim() : null,
    });
  }

  return projects;
}

function run() {
  // Only seed on first run — skip if users already exist (protects production data)
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existing.count > 0) {
    console.log('Database already initialized, skipping seed.');
    return;
  }

  console.log('First run — seeding database...');

  // --- Users ---
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, preferred_language, countries, is_active)
    VALUES (@email, @password_hash, @name, @role, @preferred_language, @countries, 1)
  `);

  const userIdByEmail = {};
  for (const u of USERS) {
    const password_hash = bcrypt.hashSync(u.password, 12);
    const info = insertUser.run({
      email: u.email,
      password_hash,
      name: u.name,
      role: u.role,
      preferred_language: u.preferred_language,
      countries: u.countries ? JSON.stringify(u.countries) : null,
    });
    userIdByEmail[u.email] = info.lastInsertRowid;
  }
  const adminId = userIdByEmail['admin@minib.cz'];

  // --- Projects ---
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn('Excel seed file not found at', EXCEL_PATH, '- skipping project import.');
  } else {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const insertProject = db.prepare(`
      INSERT INTO projects (
        project_code, sheet, country, region, project_name, company, client_name, building_type,
        minib_price_eur, project_value_eur, currency, project_value_local, exchange_rate,
        products_and_quantity, competition,
        estimated_decision_date, estimated_delivery_date, actual_order_date,
        status, phase, current_status_note,
        owner, dealer_user_id,
        win_prob_manual_min, win_prob_manual_max,
        created_by_user_id
      ) VALUES (
        @project_code, @sheet, @country, @region, @project_name, @company, NULL, NULL,
        @minib_price_eur, NULL, 'EUR', NULL, NULL,
        @products_and_quantity, @competition,
        @estimated_decision_date, @estimated_delivery_date, NULL,
        'active', @phase, @current_status_note,
        @owner, @dealer_user_id,
        @win_prob_manual_min, @win_prob_manual_max,
        @created_by_user_id
      )
    `);

    const insertComment = db.prepare(`
      INSERT INTO comments (project_id, user_id, content, source, original_language)
      VALUES (?, ?, ?, 'text', 'en')
    `);

    const year = new Date().getFullYear();
    for (const sheetName of ['TR', 'CIS']) {
      const projects = parseSheetRows(workbook, sheetName);
      let seq = 0;
      for (const p of projects) {
        seq += 1;
        const project_code = `${sheetName}-${year}-${String(seq).padStart(3, '0')}`;
        const dealerEmail = ownerEmail(p.owner);
        const dealer_user_id = dealerEmail ? userIdByEmail[dealerEmail] : null;

        const info = insertProject.run({
          project_code,
          sheet: p.sheet,
          country: p.country,
          region: p.region,
          project_name: p.project_name,
          company: p.company,
          minib_price_eur: p.minib_price_eur,
          products_and_quantity: p.products_and_quantity,
          competition: p.competition,
          estimated_decision_date: p.estimated_decision_date,
          estimated_delivery_date: p.estimated_delivery_date,
          phase: p.phase,
          current_status_note: p.current_status_note,
          owner: p.owner,
          dealer_user_id,
          win_prob_manual_min: p.win_prob_manual_min,
          win_prob_manual_max: p.win_prob_manual_max,
          created_by_user_id: adminId,
        });

        if (p.extra_comment) {
          insertComment.run(info.lastInsertRowid, adminId, p.extra_comment);
        }
      }
      console.log(`Imported ${projects.length} projects from sheet ${sheetName}`);
    }
  }

  // --- App settings (defaults) ---
  const insertSetting = db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)`);
  insertSetting.run('countries', JSON.stringify(['TR', 'AZ', 'UZ', 'KZ', 'GE', 'Mong', 'CAN']));
  insertSetting.run('building_types', JSON.stringify(['hotel', 'office', 'villa', 'residential', 'industrial', 'museum', 'sports', 'other']));
  insertSetting.run('phases', JSON.stringify(['project_stage', 'tender', 'order', 'delivery']));
  insertSetting.run('statuses', JSON.stringify(['lead', 'active', 'won', 'lost', 'on_hold']));
  insertSetting.run('regions', JSON.stringify(['Turkey', 'CIS', 'MEA']));
  insertSetting.run('dealer_visibility', JSON.stringify({ hide_hq_only_sections: false }));

  console.log('Seed completed.');
}

run();
