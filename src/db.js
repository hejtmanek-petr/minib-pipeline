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
  "ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_en TEXT",
  "ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_tr TEXT",
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
      JSON.stringify(['TR','AZ','UZ','KZ','GE','SY','IQ','TM','MN','EG','MA','DZ','LY','TN','TZ','UG','KW','AE','OM','JO','NC','BY','RU'])
    );
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
  const roleMap = { Cem:'mea_management', Ogün:'mea_management', Hakan:'mea_sales', Sefa:'mea_sales', Okan:'mea_sales', Monika:'mea_management', Pavla:'mea_management', Petr:'admin' };
  for (const [name, role] of Object.entries(roleMap)) {
    try { db.prepare("UPDATE users SET access_role = ? WHERE name = ?").run(role, name); } catch(e) {}
  }

  // Clear passwords for users without assigned password (allow login without password)
  const usersWithPassword = new Set(['Petr', 'Monika', 'Pavla']);
  db.prepare("UPDATE users SET password_hash = '' WHERE name NOT IN ('Petr','Monika','Pavla')").run();

  // Set passwords (always overwrite to ensure correct passwords)
  const passwords = { Petr:'Pashtika', Monika:'Trinity', Pavla:'Kleopatra' };
  for (const [name, pw] of Object.entries(passwords)) {
    db.prepare("UPDATE users SET password_hash = ? WHERE name = ?").run(bcrypt.hashSync(pw, 10), name);
  }
})();

module.exports = db;
