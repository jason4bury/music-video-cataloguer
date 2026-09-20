const express = require('express');
const fs = require('fs');
const mime = require('./mime');
const { db } = require('../db');
const { scanLibrary, getScanState } = require('../scanner');

const router = express.Router();

function serializeVideo(row) {
  const tags = db
    .prepare(`SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id WHERE vt.video_id = ? ORDER BY t.name`)
    .all(row.id)
    .map((t) => t.name);
  return {
    id: row.id,
    artist: row.artist,
    title: row.title,
    thumbnail: row.thumbnail,
    duration: row.duration,
    favorite: !!row.favorite,
    watched: !!row.watched,
    addedAt: row.added_at,
    tags,
  };
}

// GET /api/videos?q=&artist=&tag=&favorite=1&watched=0&sort=artist|title|added|duration&dir=asc|desc&playlist=ID
router.get('/videos', (req, res) => {
  const { q, artist, tag, favorite, watched, playlist } = req.query;
  const sort = ['artist', 'title', 'added', 'duration'].includes(req.query.sort) ? req.query.sort : 'artist';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const sortCol = { artist: 'v.artist', title: 'v.title', added: 'v.added_at', duration: 'v.duration' }[sort];

  const clauses = [];
  const params = {};

  if (q) {
    clauses.push('(v.artist LIKE @q OR v.title LIKE @q)');
    params.q = `%${q}%`;
  }
  if (artist) {
    clauses.push('v.artist = @artist');
    params.artist = artist;
  }
  if (favorite === '1') clauses.push('v.favorite = 1');
  if (watched === '0') clauses.push('v.watched = 0');
  if (watched === '1') clauses.push('v.watched = 1');
  if (tag) {
    clauses.push('v.id IN (SELECT vt.video_id FROM video_tags vt JOIN tags t ON t.id = vt.tag_id WHERE t.name = @tag)');
    params.tag = tag;
  }
  if (playlist) {
    clauses.push('v.id IN (SELECT pv.video_id FROM playlist_videos pv WHERE pv.playlist_id = @playlist)');
    params.playlist = playlist;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT v.* FROM videos v ${where} ORDER BY ${sortCol} COLLATE NOCASE ${dir}, v.title COLLATE NOCASE ASC`).all(params);

  res.json(rows.map(serializeVideo));
});

router.get('/artists', (_req, res) => {
  const rows = db.prepare('SELECT artist, COUNT(*) as count FROM videos GROUP BY artist ORDER BY artist COLLATE NOCASE').all();
  res.json(rows);
});

router.get('/tags', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.name, COUNT(vt.video_id) as count FROM tags t LEFT JOIN video_tags vt ON vt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.get('/videos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serializeVideo(row));
});

// PATCH /api/videos/:id  { favorite, watched, tags: [..] }
router.patch('/videos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const { favorite, watched, tags } = req.body || {};

  if (typeof favorite === 'boolean') {
    db.prepare('UPDATE videos SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, row.id);
  }
  if (typeof watched === 'boolean') {
    db.prepare('UPDATE videos SET watched = ? WHERE id = ?').run(watched ? 1 : 0, row.id);
  }
  if (Array.isArray(tags)) {
    const cleanTags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
    const clearVideoTags = db.prepare('DELETE FROM video_tags WHERE video_id = ?');
    const linkTag = db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)');

    const tx = db.transaction(() => {
      clearVideoTags.run(row.id);
      for (const t of cleanTags) {
        insertTag.run(t);
        const tagRow = getTagId.get(t);
        linkTag.run(row.id, tagRow.id);
      }
    });
    tx();
  }

  const updated = db.prepare('SELECT * FROM videos WHERE id = ?').get(row.id);
  res.json(serializeVideo(updated));
});

// GET /api/videos/:id/stream — range-request video streaming
router.get('/videos/:id/stream', (req, res) => {
  const row = db.prepare('SELECT filepath FROM videos WHERE id = ?').get(req.params.id);
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).end();

  const stat = fs.statSync(row.filepath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = mime.lookup(row.filepath);

  if (!range) {
    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(row.filepath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;
  end = Math.min(end, fileSize - 1);
  if (start > end) start = 0;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType,
  });
  fs.createReadStream(row.filepath, { start, end }).pipe(res);
});

router.post('/scan', async (_req, res) => {
  if (getScanState().running) return res.status(409).json(getScanState());
  scanLibrary(); // fire and forget, poll /api/scan/status
  res.json({ started: true });
});

router.get('/scan/status', (_req, res) => {
  res.json(getScanState());
});

module.exports = router;
