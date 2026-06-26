const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { dealerCanAccessProject } = require('../middleware/permissions');
const ai = require('../services/ai');

const AUDIO_DIR = path.join(__dirname, '..', '..', 'data', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

async function translateAndSave(commentId, content, sourceLang) {
  try {
    const translations = await ai.translateComment(content, sourceLang || 'cs');
    db.prepare(`UPDATE comments SET content_cs=?, content_en=?, content_tr=? WHERE id=?`)
      .run(translations.cs, translations.en, translations.tr, commentId);
  } catch (e) {
    console.error('Translation failed for comment', commentId, e.message);
  }
}

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

  const { content, source, original_language, raw_transcript, title } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

  const info = db.prepare(`
    INSERT INTO comments (project_id, user_id, content, source, original_language, raw_transcript, title)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(project.id, req.user.id, content.trim(), source || 'text', original_language || null, raw_transcript || null, title?.trim() || null);

  const comment = db.prepare(`
    SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({ comment });
  translateAndSave(comment.id, comment.content, original_language);
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

  const { content, title } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required' });

  db.prepare('UPDATE comments SET content = ?, title = ? WHERE id = ?').run(content.trim(), title?.trim() || null, comment.id);

  const updated = db.prepare(`
    SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(comment.id);

  res.json({ comment: updated });
  translateAndSave(updated.id, updated.content, updated.original_language);
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

// POST /api/projects/:id/comments/:commentId/audio  — raw binary body
router.post('/:id/comments/:commentId/audio', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!dealerCanAccessProject(req.user, project)) return res.status(403).json({ error: 'Access denied' });

  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND project_id = ?').get(req.params.commentId, project.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const ext = req.headers['x-audio-ext'] || 'webm';
  const filename = `comment-${comment.id}.${ext}`;
  const filepath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filepath, req.body);

  const audioUrl = `/api/audio/${filename}`;
  db.prepare('UPDATE comments SET audio_url = ? WHERE id = ?').run(audioUrl, comment.id);

  res.json({ audio_url: audioUrl });
});

// GET /api/audio/:filename — serve audio file
router.get('/audio/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  const ext = path.extname(filename).slice(1);
  const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'mp4' ? 'audio/mp4' : 'audio/webm';
  res.setHeader('Content-Type', mime);
  fs.createReadStream(filepath).pipe(res);
});

module.exports = router;
