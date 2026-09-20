const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/playlists', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.created_at as createdAt, COUNT(pv.video_id) as count
       FROM playlists p LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
       GROUP BY p.id ORDER BY p.name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/playlists', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name, count: 0 });
  } catch (e) {
    res.status(409).json({ error: 'a playlist with that name already exists' });
  }
});

router.delete('/playlists/:id', (req, res) => {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/playlists/:id/videos', (req, res) => {
  const playlist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'playlist not found' });
  const videoId = req.body?.videoId;
  if (!videoId) return res.status(400).json({ error: 'videoId is required' });

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_videos WHERE playlist_id = ?').get(playlist.id).m;
  db.prepare('INSERT OR IGNORE INTO playlist_videos (playlist_id, video_id, position) VALUES (?, ?, ?)').run(
    playlist.id,
    videoId,
    maxPos + 1
  );
  res.status(204).end();
});

router.delete('/playlists/:id/videos/:videoId', (req, res) => {
  db.prepare('DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?').run(req.params.id, req.params.videoId);
  res.status(204).end();
});

module.exports = router;
