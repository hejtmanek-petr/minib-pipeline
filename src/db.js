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
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

module.exports = db;
