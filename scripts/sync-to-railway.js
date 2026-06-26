// Sync local data to Railway DB — run with: node scripts/sync-to-railway.js
const db = require('../src/db');
const data = require('./sync-data.json');

console.log('Starting sync...');
console.log('Data: ', data.projects.length, 'projects,', data.comments.length, 'comments,', data.settings.length, 'settings');

const tx = db.transaction(() => {
  // Clear existing data
  db.prepare('DELETE FROM comments').run();
  db.prepare('DELETE FROM projects').run();

  // Insert projects
  const projCols = Object.keys(data.projects[0]);
  const projPlaceholders = projCols.map(() => '?').join(',');
  const projStmt = db.prepare(`INSERT OR REPLACE INTO projects (${projCols.join(',')}) VALUES (${projPlaceholders})`);
  for (const p of data.projects) {
    projStmt.run(...projCols.map(c => p[c] ?? null));
  }
  console.log('Inserted', data.projects.length, 'projects');

  // Insert comments
  if (data.comments.length > 0) {
    const comCols = Object.keys(data.comments[0]);
    const comPlaceholders = comCols.map(() => '?').join(',');
    const comStmt = db.prepare(`INSERT OR REPLACE INTO comments (${comCols.join(',')}) VALUES (${comPlaceholders})`);
    for (const c of data.comments) {
      comStmt.run(...comCols.map(col => c[col] ?? null));
    }
    console.log('Inserted', data.comments.length, 'comments');
  }

  // Update settings
  for (const s of data.settings) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(s.key, s.value);
  }
  console.log('Updated', data.settings.length, 'settings');
});

tx();
console.log('Sync complete!');
