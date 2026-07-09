const db = require('../db');
const ai = require('./ai');

// Debounce so several quick edits to the same project (e.g. auto-saving
// multiple fields in a row) trigger one AI call instead of many.
const DEBOUNCE_MS = 2 * 60 * 1000;
const timers = new Map();

async function runAssessment(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return;

  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.project_id = ?
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all(projectId);

  const result = await ai.assessWinProbability(project, comments, 'en');
  const reasoningMain = result.reasoning_en ?? result.reasoning ?? null;

  db.prepare(`
    UPDATE projects SET
      win_prob_ai = ?, win_prob_ai_min = ?, win_prob_ai_max = ?,
      win_prob_ai_reasoning = ?,
      win_prob_ai_reasoning_cs = ?, win_prob_ai_reasoning_en = ?, win_prob_ai_reasoning_tr = ?,
      win_prob_ai_updated_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    result.probability ?? null,
    result.probability_min ?? null,
    result.probability_max ?? null,
    reasoningMain,
    result.reasoning_cs ?? null,
    result.reasoning_en ?? null,
    result.reasoning_tr ?? null,
    projectId
  );
}

function scheduleAutoAssess(projectId) {
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    timers.delete(projectId);
    runAssessment(projectId).catch(err => console.error('Auto AI assessment failed for project', projectId, err.message));
  }, DEBOUNCE_MS);
  timers.set(projectId, handle);
}

// AI value estimate: only ever fills in a value when there's no manual EUR
// value — a manual value always wins and is never overwritten.
const valueTimers = new Map();

async function runValueEstimate(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return;
  if (project.project_value_eur != null) return;
  if (!project.products_and_quantity) return;

  const comments = db.prepare('SELECT content FROM comments WHERE project_id = ? ORDER BY created_at DESC LIMIT 10').all(projectId);
  const result = await ai.estimateProjectValue(project.products_and_quantity, comments);
  if (result.estimated_value_eur != null) {
    db.prepare('UPDATE projects SET ai_value_eur = ? WHERE id = ?').run(result.estimated_value_eur, projectId);
  }
}

function scheduleAiValueEstimate(projectId) {
  const existing = valueTimers.get(projectId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    valueTimers.delete(projectId);
    runValueEstimate(projectId).catch(err => console.error('AI value estimate failed for project', projectId, err.message));
  }, DEBOUNCE_MS);
  valueTimers.set(projectId, handle);
}

module.exports = { scheduleAutoAssess, runAssessment, scheduleAiValueEstimate, runValueEstimate };
