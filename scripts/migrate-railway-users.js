// One-time migration: add access_role column, create users, set passwords
// Run on Railway: railway run node scripts/migrate-railway-users.js

const bcrypt = require('bcrypt');
const db = require('../src/db');

console.log('Starting user migration...');

// 1. Add access_role column if not exists
try {
  db.exec('ALTER TABLE users ADD COLUMN access_role TEXT DEFAULT "mea_sales"');
  console.log('Added access_role column');
} catch (e) {
  console.log('access_role column already exists');
}

// 2. Fix country codes
const r1 = db.prepare("UPDATE projects SET country='MN' WHERE country='Mong'").run();
const r2 = db.prepare("UPDATE projects SET country='AZ' WHERE country='Az'").run();
console.log(`Fixed country codes: Mong→MN: ${r1.changes}, Az→AZ: ${r2.changes}`);

// 3. Migrate statuses
const r3 = db.prepare("UPDATE projects SET status='active' WHERE status IN ('lead','on_hold')").run();
console.log(`Migrated statuses to active: ${r3.changes}`);

// 4. Update app_settings
db.prepare("UPDATE app_settings SET value = ? WHERE key = 'statuses'").run(JSON.stringify(['active', 'won', 'lost']));
db.prepare("UPDATE app_settings SET value = ? WHERE key = 'countries'").run(
  JSON.stringify(['TR','AZ','UZ','KZ','GE','SY','IQ','TM','MN','EG','MA','DZ','LY','TN','TZ','UG','KW','AE','OM','JO','NC','BY','RU'])
);
console.log('Updated app_settings');

// 5. Setup users
// Rename Admin
db.prepare("UPDATE users SET name = 'Petr', access_role = 'admin' WHERE id = 1").run();

// Update existing users
const existingNames = db.prepare("SELECT name FROM users").all().map(r => r.name);

const usersToCreate = [
  { email: 'monika@minib.cz', name: 'Monika', access_role: 'mea_management', pw: 'Trinity' },
  { email: 'pavla@minib.cz', name: 'Pavla', access_role: 'mea_management', pw: 'Kleopatra' },
  { email: 'okan@minib.cz', name: 'Okan', access_role: 'mea_sales', pw: '' },
];

for (const u of usersToCreate) {
  if (!existingNames.includes(u.name)) {
    const hash = u.pw ? bcrypt.hashSync(u.pw, 10) : '';
    db.prepare("INSERT INTO users (email, password_hash, name, role, access_role, preferred_language, is_active) VALUES (?,?,?,?,?,?,?)")
      .run(u.email, hash, u.name, 'DEALER', u.access_role, 'en', 1);
    console.log(`Created user: ${u.name}`);
  } else {
    console.log(`User ${u.name} already exists, skipping`);
  }
}

// Set access_role for existing users
const roleMap = {
  'Cem': 'mea_management',
  'Ogün': 'mea_management',
  'Hakan': 'mea_sales',
  'Sefa': 'mea_sales',
  'Okan': 'mea_sales',
  'Monika': 'mea_management',
  'Pavla': 'mea_management',
};

for (const [name, role] of Object.entries(roleMap)) {
  db.prepare("UPDATE users SET access_role = ? WHERE name = ?").run(role, name);
}

// Set passwords
const passwords = {
  'Petr': 'Pashtika',
  'Monika': 'Trinity',
  'Pavla': 'Kleopatra',
};

for (const [name, pw] of Object.entries(passwords)) {
  const hash = bcrypt.hashSync(pw, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE name = ?").run(hash, name);
  console.log(`Set password for ${name}`);
}

// Clear passwords for sales users (login without password)
db.prepare("UPDATE users SET password_hash = '' WHERE access_role = 'mea_sales'").run();

// 6. Add AI reasoning columns
try { db.exec('ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_cs TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_en TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE projects ADD COLUMN win_prob_ai_reasoning_tr TEXT'); } catch(e) {}
console.log('AI reasoning columns ready');

// Summary
const users = db.prepare("SELECT name, access_role FROM users WHERE is_active = 1 ORDER BY name").all();
console.log('\nFinal users:');
users.forEach(u => console.log(`  ${u.name}: ${u.access_role}`));
console.log('\nMigration complete!');
