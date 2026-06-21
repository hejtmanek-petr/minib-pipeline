require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const fs = require('fs');
const path2 = require('path');
const authRoutes = require('./src/routes/auth');
const projectsRoutes = require('./src/routes/projects');
const commentsRoutes = require('./src/routes/comments');
const reportsRoutes = require('./src/routes/reports');
const adminRoutes = require('./src/routes/admin');
const aiRoutes = require('./src/routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway/Heroku reverse proxy
app.set('trust proxy', 1);

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Public audio serving (no auth required — URLs are unguessable per comment ID)
const AUDIO_DIR = path2.join(__dirname, 'data', 'audio');
app.get('/api/audio/:filename', (req, res) => {
  const filename = path2.basename(req.params.filename);
  const filepath = path2.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  const ext = path2.extname(filename).slice(1);
  const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'mp4' ? 'audio/mp4' : 'audio/webm';
  res.setHeader('Content-Type', mime);
  fs.createReadStream(filepath).pipe(res);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/projects', commentsRoutes);
app.use('/api', commentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use('/locales', express.static(path.join(__dirname, 'locales')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MINIB Project Pipeline running on http://localhost:${PORT}`);
});
