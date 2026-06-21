#!/usr/bin/env node
/**
 * Sync local comments to Railway DB using project_code as the key for ID mapping.
 * Reads local SQLite directly (no local server needed).
 */

const path = require('path');
const Database = require('better-sqlite3');

const RAILWAY_URL = 'https://minib-pipeline-production.up.railway.app';
const ACCESS_CODE = process.env.MINIB_CODE || 'minib2024';

const DB_PATH = path.join(__dirname, '..', 'data', 'pipeline.db');
const db = new Database(DB_PATH, { readonly: true });

async function login() {
  const res = await fetch(`${RAILWAY_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: ACCESS_CODE }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie');
  const match = setCookie && setCookie.match(/minib_access=[^;]+/);
  if (!match) throw new Error('No session cookie returned');
  return match[0];
}

async function apiFetch(cookie, urlPath, opts = {}) {
  const res = await fetch(`${RAILWAY_URL}${urlPath}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${urlPath} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('=== Logging in to Railway ===');
  const cookie = await login();

  // --- Step 1: Delete wrongly imported comments (IDs 1–31) ---
  const wrongIds = Array.from({ length: 31 }, (_, i) => i + 1);
  console.log(`\n=== Deleting ${wrongIds.length} wrong comments from Railway ===`);
  const delResult = await apiFetch(cookie, '/api/admin/delete-comments-by-ids', {
    method: 'POST',
    body: JSON.stringify({ ids: wrongIds }),
  });
  console.log('Deleted:', delResult);

  // --- Step 2: Get Railway project_name → highest id map ---
  console.log('\n=== Fetching Railway projects ===');
  const railwayData = await apiFetch(cookie, '/api/projects');
  const nameToRailwayId = {};
  for (const p of railwayData.projects) {
    if (p.project_name) {
      // Keep the highest ID when there are duplicates (newest import)
      if (!nameToRailwayId[p.project_name] || p.id > nameToRailwayId[p.project_name]) {
        nameToRailwayId[p.project_name] = p.id;
      }
    }
  }
  console.log(`Loaded ${Object.keys(nameToRailwayId).length} unique Railway projects`);

  // --- Step 3: Read local comments with project_name ---
  const localComments = db.prepare(`
    SELECT c.*, p.project_name
    FROM comments c
    JOIN projects p ON p.id = c.project_id
    ORDER BY c.id
  `).all();
  console.log(`\nFound ${localComments.length} local comments`);

  // --- Step 4: Group by project_name and import ---
  console.log('\n=== Importing to Railway ===');
  const byName = {};
  for (const c of localComments) {
    if (!byName[c.project_name]) byName[c.project_name] = [];
    byName[c.project_name].push(c);
  }

  let totalImported = 0, totalSkipped = 0;
  for (const [name, comments] of Object.entries(byName)) {
    const railwayProjectId = nameToRailwayId[name];
    if (!railwayProjectId) {
      console.log(`  SKIP: "${name}" — not found on Railway`);
      totalSkipped += comments.length;
      continue;
    }

    const payload = comments.map(c => ({
      id: c.id,
      project_id: railwayProjectId,
      user_id: 1,
      content: c.content,
      source: c.source || 'text',
      original_language: c.original_language || null,
      raw_transcript: c.raw_transcript || null,
      title: c.title || null,
      audio_url: null,
      content_cs: c.content_cs || null,
      content_en: c.content_en || null,
      content_de: c.content_de || null,
      content_tr: c.content_tr || null,
      created_at: c.created_at || null,
    }));

    const result = await apiFetch(cookie, '/api/admin/import-comments', {
      method: 'POST',
      body: JSON.stringify({ comments: payload }),
    });
    console.log(`  "${name}" → Railway project ${railwayProjectId}: inserted=${result.inserted}, skipped=${result.skipped}`);
    totalImported += result.inserted || 0;
  }

  console.log(`\n=== Done: imported=${totalImported}, skipped=${totalSkipped} ===`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
