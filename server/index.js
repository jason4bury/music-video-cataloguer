const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { THUMB_DIR } = require('./db');
const { scanLibrary, getScanState, LIBRARY_PATH } = require('./scanner');
const { ensureDefaultUser, verifyCredentials } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3211;
const SCAN_ON_START = process.env.SCAN_ON_START !== 'false';
const SCAN_INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MINUTES || '0', 10);

ensureDefaultUser();

app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    name: 'mvc.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

const OPEN_PATHS = new Set(['/login', '/api/login', '/health']);

app.use((req, res, next) => {
  if (OPEN_PATHS.has(req.path)) return next();
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyCredentials(username, password);
  if (!user) return res.status(401).json({ error: 'invalid username or password' });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'login failed' });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ ok: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.use('/thumbnails', express.static(THUMB_DIR, { maxAge: '1d' }));
app.use('/api', require('./routes/videos'));
app.use('/api', require('./routes/playlists'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, library: LIBRARY_PATH }));

app.listen(PORT, () => {
  console.log(`Music video cataloguer listening on :${PORT}`);
  console.log(`Watching library at ${LIBRARY_PATH}`);

  if (SCAN_ON_START) {
    scanLibrary().then((s) => console.log(`Initial scan: +${s.added} -${s.removed} (${s.scanned} files seen)`));
  }
  if (SCAN_INTERVAL_MIN > 0) {
    setInterval(() => {
      if (!getScanState().running) scanLibrary();
    }, SCAN_INTERVAL_MIN * 60 * 1000);
  }
});
