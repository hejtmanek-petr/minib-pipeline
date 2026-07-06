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

module.exports = { scheduleAutoAssess, runAssessment };
