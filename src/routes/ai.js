const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ai = require('../services/ai');

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

module.exports = router;
