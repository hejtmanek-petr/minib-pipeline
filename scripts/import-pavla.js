#!/usr/bin/env node
/* One-time import of Roman Lád + ZO 05.06. sheets from Pavla's Excel */
const XLSX = require('xlsx');

const BASE_URL = 'https://minib-pipeline-production.up.railway.app';
const ACCESS_CODE = 'minib2024';
const FILE_PATH = '/Users/petrhejtmanek/Library/CloudStorage/OneDrive-MINIBa.s/REPORTING/Report projekty Minib-2026-04-20 Pavla.xlsx';

function excelSerialToISO(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeDate(v) {
  if (!v || v === '?' || v === 'unknown') return null;
  if (typeof v === 'number') {
    if (v > 10000) return excelSerialToISO(v);
    if (v >= 2025 && v <= 2030) return `${v}-01-01`; // bare year
  }
  return null; // text like "1/2 2026", "Q4" etc. — not a real date
}

function normalizeDateNote(v) {
  if (!v) return null;
  if (typeof v === 'number') {
    if (v > 10000) return excelSerialToISO(v);
    if (v >= 2025 && v <= 2030) return String(v);
  }
  return String(v).trim() || null;
}

function normalizeProb(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v <= 1 && v > 0) return Math.round(v * 100);
    if (v > 1) return Math.round(v); // already in %
    if (v === 0) return 0;
  }
  return null;
}

function deriveStatus(statusText, prob) {
  if (!statusText) return 'active';
  const s = String(statusText).toLowerCase();
  if (s.includes('výhra') || s.includes('vyhráno')) return 'won';
  if (s.includes('prohrán') || s.includes('prohráno')) return 'lost';
  return 'active';
}

function parseRomanLad(wb) {
  // Sheet name has trailing space
  const sheetName = wb.SheetNames.find(n => n.trim() === 'Roman Lád');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Row 3 = header, data from row 4
  return rows.slice(4)
    .filter(r => r[4] !== null && r[4] !== undefined) // must have project name
    .map(r => {
      const [_a, _b, country, countryReal, projectName, statusText, amountEur, deadline, description, probability, investor, genDodavatel] = r;
      const prob = normalizeProb(probability);
      const deadlineNote = normalizeDateNote(deadline);
      // Build note: combine description + deadline text
      let note = description ? String(description).trim() : null;
      if (deadlineNote && note) note = `${deadlineNote} | ${note}`;
      else if (deadlineNote) note = deadlineNote;

      return {
        sheet: 'Roman',
        region: 'CZ/SK',
        country: country ? String(country).trim() : null,
        project_name: projectName ? String(projectName).trim() : null,
        company: investor ? String(investor).trim() : null,
        general_contractor: genDodavatel ? String(genDodavatel).trim() : null,
        project_value_eur: typeof amountEur === 'number' ? amountEur : null,
        currency: 'EUR',
        estimated_decision_date: normalizeDate(deadline),
        status: deriveStatus(statusText, prob),
        phase: 'project_stage',
        current_status_note: note,
        owner: 'Roman',
        win_prob_manual_min: prob,
        win_prob_manual_max: prob,
        _comment: null,
      };
    });
}

function parseZO(wb) {
  const ws = wb.Sheets['ZO 05.06.'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // Row 3 = header, data from row 4
  return rows.slice(4)
    .filter(r => r[2] !== null && r[2] !== undefined) // must have project name
    .map(r => {
      const [country, countryReal, projectName, company, deadline, description, amountEur, probability] = r;
      const prob = normalizeProb(probability);
      const deadlineNote = normalizeDateNote(deadline);
      let note = description ? String(description).trim() : null;
      if (deadlineNote && note) note = `${deadlineNote} | ${note}`;
      else if (deadlineNote) note = deadlineNote;

      return {
        sheet: 'ZO',
        region: 'ZO',
        country: country ? String(country).trim() : null,
        project_name: projectName ? String(projectName).trim() : null,
        company: company ? String(company).trim() : null,
        project_value_eur: typeof amountEur === 'number' ? amountEur : null,
        currency: 'EUR',
        estimated_decision_date: normalizeDate(deadline),
        status: 'active',
        phase: 'project_stage',
        current_status_note: note,
        owner: 'Pavla',
        win_prob_manual_min: prob,
        win_prob_manual_max: prob,
        _comment: null,
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
  if (!res.ok) throw new Error(`POST failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  const wb = XLSX.readFile(FILE_PATH);
  const projects = [
    ...parseRomanLad(wb),
    ...parseZO(wb),
  ];

  console.log(`Parsed ${projects.length} projects (Roman Lád + ZO 05.06.)`);
  console.log('Logging in...');
  const cookie = await login();
  console.log('OK\n');

  let ok = 0, fail = 0;
  for (const p of projects) {
    delete p._comment;
    try {
      const { project } = await createProject(cookie, p);
      console.log(`  ✓ [${project.project_code}] ${p.project_name || '(no name)'} — ${p.company || ''} (${p.country})`);
      ok++;
    } catch (e) {
      console.error(`  ✗ FAILED: ${p.project_name} — ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\nDone: ${ok} imported, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
