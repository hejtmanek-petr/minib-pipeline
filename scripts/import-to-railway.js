#!/usr/bin/env node
/* One-time import of CIS.xlsx and TR.xlsx into Railway production */
const XLSX = require('xlsx');

const BASE_URL = 'https://minib-pipeline-production.up.railway.app';
const ACCESS_CODE = 'minib2024';

const CIS_PATH = '/Users/petrhejtmanek/Library/CloudStorage/OneDrive-MINIBa.s/ZÁKAZNÍCI MINIB/TUR Turkey/mea reporting/CIS.xlsx';
const TR_PATH  = '/Users/petrhejtmanek/Library/CloudStorage/OneDrive-MINIBa.s/ZÁKAZNÍCI MINIB/TUR Turkey/mea reporting/TR.xlsx';

function excelSerialToISO(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeDate(v) {
  if (!v || v === '?' || v === 'unknown') return null;
  if (typeof v === 'number' && v > 10000) return excelSerialToISO(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === '?') return null;
    // e.g. "Q4", "2027 Q2", "tendr expected when?" → store as text note, not date
    return null;
  }
  return null;
}

function normalizeProb(v) {
  if (v === null || v === undefined || v === '' || v === '?') return null;
  if (typeof v === 'number') {
    if (v <= 1) return Math.round(v * 100);
    return Math.round(v);
  }
  return null;
}

function derivePhase(statusNote) {
  if (!statusNote) return 'project_stage';
  const s = String(statusNote).toLowerCase();
  if (s.includes('tender') || s.includes('tendr')) return 'tender';
  if (s.includes('order') || s.includes('won') || s.includes('production') || s.includes('payment')) return 'order';
  if (s.includes('deliver')) return 'delivery';
  return 'project_stage';
}

function deriveStatus(prob) {
  if (prob === 0) return 'lost';
  if (prob === 100) return 'won';
  return 'active';
}

function parseSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const data = rows.slice(2); // skip empty row 0 + header row 1

  return data
    .filter(r => r.some(c => c !== null))
    .map(r => {
      const [country, projectName, company, probability, decisionDate,
             productsAndQuantity, competition, deliveryDate, owner,
             colJ, colK, colL] = r;

      let currentStatusNote, extraComment, minibPrice;
      if (sheetName === 'TR') {
        currentStatusNote = colJ;
        extraComment = colK;
        minibPrice = typeof colL === 'number' ? colL : null;
      } else {
        currentStatusNote = colJ;
        extraComment = null;
        minibPrice = typeof colK === 'number' ? colK : null;
      }

      const prob = normalizeProb(probability);

      return {
        sheet: sheetName,
        region: sheetName === 'TR' ? 'Turkey' : 'CIS',
        country: country ? String(country).trim() : null,
        project_name: projectName ? String(projectName).trim() : null,
        company: company ? String(company).trim() : null,
        products_and_quantity: productsAndQuantity ? String(productsAndQuantity).trim() : null,
        competition: competition ? String(competition).trim() : null,
        estimated_decision_date: normalizeDate(decisionDate),
        estimated_delivery_date: normalizeDate(deliveryDate),
        owner: owner ? String(owner).trim() : null,
        current_status_note: currentStatusNote ? String(currentStatusNote).trim() : null,
        phase: derivePhase(currentStatusNote),
        status: deriveStatus(prob),
        minib_price_eur: minibPrice,
        win_prob_manual_min: prob,
        win_prob_manual_max: prob,
        _extra_comment: extraComment ? String(extraComment).trim() : null,
      };
    });
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: ACCESS_CODE }),
  });
  if (!res.ok) throw new Error('Login failed: ' + await res.text());
  // Extract cookie
  const setCookie = res.headers.get('set-cookie');
  const match = setCookie && setCookie.match(/minib_access=([^;]+)/);
  if (!match) throw new Error('No auth cookie received');
  return `minib_access=${match[1]}`;
}

async function createProject(cookie, project) {
  const res = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST /api/projects failed: ${txt}`);
  }
  return res.json();
}

async function addComment(cookie, projectId, content) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ content, source: 'text' }),
  });
  if (!res.ok) console.warn('  Comment failed:', await res.text());
}

async function main() {
  console.log('Logging in...');
  const cookie = await login();
  console.log('Logged in OK\n');

  const projects = [
    ...parseSheet(CIS_PATH, 'CIS'),
    ...parseSheet(TR_PATH, 'TR'),
  ];

  console.log(`Importing ${projects.length} projects...\n`);

  let ok = 0, fail = 0;
  for (const p of projects) {
    const extra = p._extra_comment;
    delete p._extra_comment;

    try {
      const { project } = await createProject(cookie, p);
      console.log(`  ✓ [${project.project_code}] ${p.project_name || '(no name)'} — ${p.company || ''}`);

      if (extra) {
        await addComment(cookie, project.id, extra);
        console.log(`    + comment added`);
      }
      ok++;
    } catch (e) {
      console.error(`  ✗ FAILED: ${p.project_name || p.company} — ${e.message}`);
      fail++;
    }

    // Small delay to avoid hammering the server
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nDone: ${ok} imported, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
