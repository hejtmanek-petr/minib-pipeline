const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/pipeline.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
db.exec(fs.readFileSync(schemaPath, 'utf-8'));

// Runtime migrations — safe to run repeatedly (catch duplicate column errors)
const migrations = [
  "ALTER TABLE projects ADD COLUMN investor TEXT",
  "ALTER TABLE projects ADD COLUMN general_contractor TEXT",
  "ALTER TABLE projects ADD COLUMN installation_company TEXT",
  "ALTER TABLE projects ADD COLUMN ai_value_eur REAL",
  "ALTER TABLE comments ADD COLUMN audio_url TEXT",
  "ALTER TABLE comments ADD COLUMN title TEXT",
  "ALTER TABLE comments ADD COLUMN content_cs TEXT",
  "ALTER TABLE comments ADD COLUMN content_en TEXT",
  "ALTER TABLE comments ADD COLUMN content_de TEXT",
  "ALTER TABLE comments ADD COLUMN content_tr TEXT",
  "ALTER TABLE users ADD COLUMN access_role TEXT DEFAULT 'mea_sales'",
  "ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_cs TEXT",
  "ALTER TABLE projects ADD COLUMN order_number TEXT",
  "ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_en TEXT",
  "ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_tr TEXT",
  "ALTER TABLE users ADD COLUMN password_plain TEXT",
  `CREATE TABLE IF NOT EXISTS settings_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    setting_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS project_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    projects_json TEXT NOT NULL,
    comments_json TEXT NOT NULL,
    csv_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  "ALTER TABLE project_snapshots ADD COLUMN csv_data TEXT",
  `CREATE TABLE IF NOT EXISTS country_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    trend TEXT,
    contacts_level TEXT,
    political_situation TEXT,
    economic_situation TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  "ALTER TABLE country_reports ADD COLUMN responsible_owners TEXT",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

// One-time user migration
(function migrateUsers() {
  const bcrypt = require('bcrypt');

  // Rename Admin to Petr
  try { db.prepare("UPDATE users SET name = 'Petr', access_role = 'admin' WHERE id = 1 AND name = 'Admin'").run(); } catch(e) {}

  // Fix country codes
  try { db.prepare("UPDATE projects SET country='MN' WHERE country='Mong'").run(); } catch(e) {}
  try { db.prepare("UPDATE projects SET country='AZ' WHERE country='Az'").run(); } catch(e) {}

  // Migrate statuses
  try { db.prepare("UPDATE projects SET status='active' WHERE status IN ('lead','on_hold')").run(); } catch(e) {}

  // Update app_settings
  try {
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'statuses'").run(JSON.stringify(['active','won','lost']));
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'countries'").run(
      JSON.stringify(['AL','DZ','AZ','BY','BG','EG','GE','GR','IQ','JO','KZ','KW','KG','LY','MN','MA','MK','NC','OM','QA','RU','SA','RS','SY','TJ','TZ','TN','TM','TR','UG','UA','AE','UZ'])
    );

    // Exclusivity: 'exclusive' = MEA is the sole authorized partner there;
    // 'non_exclusive' = MEA can sell but without exclusivity; 'conditional' =
    // non-exclusive for now, moves to exclusive once peace/sanctions allow.
    const exclusivity = {
      TR:'exclusive', AZ:'exclusive', UZ:'exclusive', KZ:'exclusive', GE:'exclusive', SY:'exclusive',
      IQ:'exclusive', TM:'exclusive', MN:'exclusive', EG:'exclusive', MA:'exclusive', DZ:'exclusive',
      LY:'exclusive', TN:'exclusive', TZ:'exclusive', UG:'exclusive', KW:'exclusive', AE:'exclusive',
      OM:'exclusive', JO:'exclusive', NC:'exclusive',
      KG:'non_exclusive', TJ:'non_exclusive', QA:'non_exclusive', SA:'non_exclusive', GR:'non_exclusive',
      BG:'non_exclusive', AL:'non_exclusive', MK:'non_exclusive', RS:'non_exclusive',
      BY:'conditional', RU:'conditional', UA:'conditional',
    };
    const existingExclusivity = db.prepare("SELECT value FROM app_settings WHERE key = 'country_exclusivity'").get();
    if (existingExclusivity) {
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'country_exclusivity'").run(JSON.stringify(exclusivity));
    } else {
      db.prepare("INSERT INTO app_settings (key, value) VALUES ('country_exclusivity', ?)").run(JSON.stringify(exclusivity));
    }
  } catch(e) {}

  // Create missing users
  const existingNames = db.prepare("SELECT name FROM users").all().map(r => r.name);
  const toCreate = [
    { email:'monika@minib.cz', name:'Monika', role:'mea_management', pw:'Trinity' },
    { email:'pavla@minib.cz', name:'Pavla', role:'mea_management', pw:'Kleopatra' },
    { email:'okan@minib.cz', name:'Okan', role:'mea_sales', pw:'' },
  ];
  for (const u of toCreate) {
    if (!existingNames.includes(u.name)) {
      const hash = u.pw ? bcrypt.hashSync(u.pw, 10) : '';
      db.prepare("INSERT INTO users (email,password_hash,name,role,access_role,preferred_language,is_active) VALUES (?,?,?,?,?,?,?)")
        .run(u.email, hash, u.name, 'DEALER', u.role, 'en', 1);
    }
  }

  // Set access_role for all users
  const roleMap = { Cem:'mea_management', Ogün:'mea_management', Hakan:'mea_sales', Sefa:'mea_sales', Okan:'mea_sales', Monika:'admin', Pavla:'mea_management', Petr:'admin' };
  for (const [name, role] of Object.entries(roleMap)) {
    try { db.prepare("UPDATE users SET access_role = ? WHERE name = ?").run(role, name); } catch(e) {}
  }

  // Seed initial passwords — but only for a user that has never had one set.
  // This used to run unconditionally on every startup, which meant every
  // deploy silently reset anyone's password back to these defaults, wiping
  // out any password they'd since changed.
  const passwords = { Petr:'Pashtika', Monika:'Trinity', Pavla:'Kleopatra', Cem:'MEA8547#C', Hakan:'MEA3921#H', Ogün:'MEA6284#O', Okan:'MEA7135#K', Sefa:'MEA4693#S' };
  for (const [name, pw] of Object.entries(passwords)) {
    const existing = db.prepare("SELECT password_plain FROM users WHERE name = ?").get(name);
    if (existing && !existing.password_plain) {
      db.prepare("UPDATE users SET password_hash = ?, password_plain = ? WHERE name = ?").run(bcrypt.hashSync(pw, 10), pw, name);
    }
  }
})();

// One-time data sync from local export
(function syncData() {
  const syncPath = path.join(__dirname, '..', 'scripts', 'sync-data.json');
  if (!fs.existsSync(syncPath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
    if (!data.projects || !data.projects.length) return;

    const syncVersion = data._syncVersion || 0;
    const currentVersion = db.prepare("SELECT value FROM app_settings WHERE key = 'sync_version'").get();
    if (currentVersion && parseInt(currentVersion.value) >= syncVersion) return;

    console.log('Syncing data:', data.projects.length, 'projects,', data.comments.length, 'comments');
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM comments').run();
      db.prepare('DELETE FROM projects').run();
      const projCols = Object.keys(data.projects[0]);
      const projStmt = db.prepare(`INSERT OR REPLACE INTO projects (${projCols.join(',')}) VALUES (${projCols.map(() => '?').join(',')})`);
      for (const p of data.projects) projStmt.run(...projCols.map(c => p[c] ?? null));
      if (data.comments.length > 0) {
        const comCols = Object.keys(data.comments[0]);
        const comStmt = db.prepare(`INSERT OR REPLACE INTO comments (${comCols.join(',')}) VALUES (${comCols.map(() => '?').join(',')})`);
        for (const c of data.comments) comStmt.run(...comCols.map(col => c[col] ?? null));
      }
      for (const s of data.settings) {
        db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(s.key, s.value);
      }
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_version', ?)").run(String(syncVersion));
    });
    tx();
    console.log('Data sync complete! Version:', syncVersion);
  } catch (e) {
    console.error('Data sync failed:', e.message);
  }
})();

// Shared CSV generator for snapshots
const CSV_COLS = [
  { key: 'project_code', label: 'Project Code' },
  { key: 'project_name', label: 'Project Name' },
  { key: 'country', label: 'Country' },
  { key: 'sheet', label: 'Region' },
  { key: 'company', label: 'Client' },
  { key: 'investor', label: 'Investor' },
  { key: 'general_contractor', label: 'General Contractor' },
  { key: 'installation_company', label: 'Installation Company' },
  { key: 'building_type', label: 'Building Type' },
  { key: 'status', label: 'Status' },
  { key: 'phase', label: 'Phase' },
  { key: 'products_and_quantity', label: 'Articles & Quantities' },
  { key: 'competition', label: 'Competition' },
  { key: 'estimated_decision_date', label: 'Decision Date' },
  { key: 'estimated_delivery_date', label: 'Delivery Date' },
  { key: 'actual_order_date', label: 'Order Date' },
  { key: 'project_value_eur', label: 'Project Value EUR' },
  { key: 'minib_price_eur', label: 'MINIB Price EUR' },
  { key: 'currency', label: 'Currency' },
  { key: 'project_value_local', label: 'Value Local Currency' },
  { key: 'exchange_rate', label: 'Exchange Rate' },
  { key: 'win_prob_manual_min', label: 'Win Prob Min %' },
  { key: 'win_prob_manual_max', label: 'Win Prob Max %' },
  { key: 'win_prob_ai', label: 'AI%' },
  { key: 'current_status_note', label: 'Status Note' },
  { key: 'created_at', label: 'Created At' },
  { key: 'updated_at', label: 'Updated At' },
];

function csvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/\r?\n/g, ' ');
  if (str.includes('"') || str.includes(';') || str.includes(',')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCsv(projects) {
  const header = CSV_COLS.map(c => csvCell(c.label)).join(';');
  const rows = projects.map(p => CSV_COLS.map(c => csvCell(p[c.key])).join(';'));
  return '﻿' + [header, ...rows].join('\r\n');
}

// Auto-snapshot on startup (max 1 per day, keep 90 days)
(function autoSnapshot() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const existing = db.prepare("SELECT id FROM project_snapshots WHERE created_at >= ? LIMIT 1").get(today + ' 00:00:00');
    if (!existing) {
      const projects = db.prepare('SELECT * FROM projects').all();
      const comments = db.prepare('SELECT * FROM comments').all();
      db.prepare("INSERT INTO project_snapshots (label, projects_json, comments_json, csv_data) VALUES (?, ?, ?, ?)")
        .run('auto:' + today, JSON.stringify(projects), JSON.stringify(comments), generateCsv(projects));
      db.prepare("DELETE FROM project_snapshots WHERE created_at < datetime('now', '-90 days')").run();
      console.log('Auto-snapshot created for', today);
    }
  } catch (e) {
    console.error('Auto-snapshot failed:', e.message);
  }
})();

// Always enforce: never show AI value when manual EUR value is set
db.prepare('UPDATE projects SET ai_value_eur = NULL WHERE project_value_eur IS NOT NULL AND ai_value_eur IS NOT NULL').run();

// Manual cleanup: clear AI value for MEA-2026-060
db.prepare("UPDATE projects SET ai_value_eur = NULL WHERE project_code = 'MEA-2026-060'").run();

module.exports = db;
module.exports.generateCsv = generateCsv;
module.exports.CSV_COLS = CSV_COLS;
