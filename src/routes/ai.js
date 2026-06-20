const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ai = require('../services/ai');
const db = require('../db');

const router = express.Router();

router.use(requireAuth);

// POST /api/ai/correct-transcript
router.post('/correct-transcript', async (req, res) => {
  const { text, language } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  try {
    const corrected = await ai.correctTranscript(text, language || 'en');
    res.json({ corrected });
  } catch (err) {
    console.error('Transcript correction failed:', err.message);
    res.status(503).json({ error: 'AI correction is currently unavailable', corrected: text });
  }
});

// POST /api/ai/estimate-value/:id — estimate & save for one project
router.post('/estimate-value/:id', async (req, res) => {
  const project = db.prepare('SELECT id, products_and_quantity FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.products_and_quantity || !project.products_and_quantity.trim()) {
    return res.status(400).json({ error: 'No products text to estimate from' });
  }

  try {
    const result = await ai.estimateProjectValue(project.products_and_quantity);
    if (result.estimated_value_eur != null) {
      db.prepare('UPDATE projects SET ai_value_eur = ? WHERE id = ?')
        .run(result.estimated_value_eur, project.id);
    }
    res.json(result);
  } catch (err) {
    console.error('Value estimation failed:', err.message);
    res.status(503).json({ error: 'AI estimation unavailable: ' + err.message });
  }
});

// POST /api/ai/estimate-value-batch — estimate for all projects with products text
router.post('/estimate-value-batch', async (req, res) => {
  if (req.user.role !== 'HQ') return res.status(403).json({ error: 'HQ only' });

  const projects = db.prepare(
    "SELECT id, products_and_quantity FROM projects WHERE products_and_quantity IS NOT NULL AND products_and_quantity != '' AND length(products_and_quantity) > 3"
  ).all();

  res.json({ started: true, total: projects.length });

  // Run in background with delay to avoid rate limiting
  (async () => {
    let done = 0, skipped = 0, errors = 0;
    for (const p of projects) {
      try {
        const result = await ai.estimateProjectValue(p.products_and_quantity);
        if (result.estimated_value_eur != null) {
          db.prepare('UPDATE projects SET ai_value_eur = ? WHERE id = ?')
            .run(result.estimated_value_eur, p.id);
          done++;
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`Batch estimate failed for project ${p.id}:`, e.message);
        errors++;
      }
      await new Promise(r => setTimeout(r, 300)); // 300ms between calls
    }
    console.log(`Batch estimate done: ${done} updated, ${skipped} skipped, ${errors} errors`);
  })();
});

module.exports = router;
