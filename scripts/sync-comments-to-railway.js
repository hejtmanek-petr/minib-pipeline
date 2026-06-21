#!/usr/bin/env node
/**
 * Sync local comments to Railway DB using project_code as the key for ID mapping.
 * Steps:
 *  1. Delete wrongly imported comments from Railway (IDs 1–31)
 *  2. Export local comments with project_code
 *  3. On Railway, find project_id by project_code
 *  4. Import comments with correct project_id
 */

const RAILWAY_URL = 'https://minib-pipeline-production.up.railway.app';
const LOCAL_URL = 'http://localhost:3000';

// Login credentials (HQ user)
const EMAIL = 'petr.hejtmanek@minib.cz';
const PASSWORD = process.env.MINIB_PASSWORD;

if (!PASSWORD) {
  console.error('Set MINIB_PASSWORD env variable');
  process.exit(1);
}

async function login(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed at ${baseUrl}: ${res.status}`);
  // Extract cookie
  const setCookie = res.headers.get('set-cookie');
  const match = setCookie && setCookie.match(/minib_session=[^;]+/);
  if (!match) throw new Error('No session cookie returned');
  return match[0];
}

async function apiFetch(baseUrl, cookie, path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('=== Logging in locally ===');
  const localCookie = await login(LOCAL_URL);
  console.log('=== Logging in to Railway ===');
  const railwayCookie = await login(RAILWAY_URL);

  // --- Step 1: Delete wrongly imported comments from Railway ---
  const wrongIds = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31];
  console.log(`\n=== Deleting ${wrongIds.length} wrong comments from Railway ===`);
  const delResult = await apiFetch(RAILWAY_URL, railwayCookie, '/api/admin/delete-comments-by-ids', {
    method: 'POST',
    body: JSON.stringify({ ids: wrongIds }),
  });
  console.log('Deleted:', delResult);

  // --- Step 2: Get all Railway projects (project_code → id map) ---
  console.log('\n=== Fetching Railway projects ===');
  const railwayProjects = await apiFetch(RAILWAY_URL, railwayCookie, '/api/projects?limit=9999');
  const codeToRailwayId = {};
  for (const p of railwayProjects.projects) {
    codeToRailwayId[p.project_code] = p.id;
  }
  console.log(`Loaded ${Object.keys(codeToRailwayId).length} Railway projects`);

  // --- Step 3: Get all local comments with project_code ---
  console.log('\n=== Fetching local projects & comments ===');
  const localProjects = await apiFetch(LOCAL_URL, localCookie, '/api/projects?limit=9999');
  const localIdToCode = {};
  for (const p of localProjects.projects) {
    localIdToCode[p.id] = p.project_code;
  }

  // Collect all local comments by fetching per-project
  const allComments = [];
  let fetched = 0;
  for (const p of localProjects.projects) {
    try {
      const data = await apiFetch(LOCAL_URL, localCookie, `/api/projects/${p.id}/comments`);
      if (data.comments && data.comments.length > 0) {
        for (const c of data.comments) {
          allComments.push({ ...c, project_code: p.project_code });
        }
        fetched++;
      }
    } catch (e) {
      // project might have no comments endpoint access — skip
    }
  }
  console.log(`Found ${allComments.length} local comments across ${fetched} projects`);

  // --- Step 4: Import comments to Railway with correct project_id ---
  console.log('\n=== Importing comments to Railway ===');
  let imported = 0, skipped = 0;

  // Group comments by project_code
  const byCode = {};
  for (const c of allComments) {
    if (!byCode[c.project_code]) byCode[c.project_code] = [];
    byCode[c.project_code].push(c);
  }

  for (const [code, comments] of Object.entries(byCode)) {
    const railwayProjectId = codeToRailwayId[code];
    if (!railwayProjectId) {
      console.log(`  SKIP: project_code ${code} not found on Railway`);
      skipped += comments.length;
      continue;
    }

    // Build payload — use local IDs but remap project_id
    const payload = comments.map(c => ({
      id: c.id,
      project_id: railwayProjectId,
      user_id: c.user_id || 1,
      content: c.content,
      source: c.source || 'text',
      original_language: c.original_language || null,
      raw_transcript: c.raw_transcript || null,
      title: c.title || null,
      audio_url: null, // audio files are local only
      content_cs: c.content_cs || null,
      content_en: c.content_en || null,
      content_de: c.content_de || null,
      content_tr: c.content_tr || null,
      created_at: c.created_at || null,
    }));

    const result = await apiFetch(RAILWAY_URL, railwayCookie, '/api/admin/import-comments', {
      method: 'POST',
      body: JSON.stringify({ comments: payload }),
    });
    console.log(`  ${code} → Railway project ${railwayProjectId}: inserted=${result.inserted}, skipped=${result.skipped}`);
    imported += result.inserted || 0;
  }

  console.log(`\n=== Done: imported=${imported}, skipped=${skipped} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
