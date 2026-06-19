const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { dealerCanAccessProject } = require('../middleware/permissions');
const ai = require('../services/ai');

const router = express.Router();

router.use(requireAuth);

// GET /api/projects/:id/comments
router.get('/:id/comments', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const comments = db.prepare(`
    SELECT c.*, u.name AS author_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.project_id = ?
    ORDER BY c.created_at DESC, c.id DESC
  `).all(project.id);
  res.json({ comments });
});

// POST /api/projects/:id/comments
router.post('/:id/comments', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const { content, source, original_language, raw_transcript } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

  const info = db.prepare(`
    INSERT INTO comments (project_id, user_id, content, source, original_language, raw_transcript)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(project.id, req.user.id, content.trim(), source || 'text', original_language || null, raw_transcript || null);

  const comment = db.prepare(`
    SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({ comment });
});

// PUT /api/projects/:id/comments/:commentId
router.put('/:id/comments/:commentId', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?').get(req.params.commentId, project.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && req.user.role !== 'HQ') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

  db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(content.trim(), comment.id);

  const updated = db.prepare(`
    SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(comment.id);

  res.json({ comment: updated });
});

// DELETE /api/projects/:id/comments/:commentId
router.delete('/:id/comments/:commentId', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?').get(req.params.commentId, project.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id && req.user.role !== 'HQ') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.json({ success: true });
});

module.exports = router;
