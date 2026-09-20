const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { db, THUMB_DIR } = require('./db');

const LIBRARY_PATH = process.env.LIBRARY_PATH || '/videos';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v']);

let scanState = { running: false, scanned: 0, total: 0, added: 0, removed: 0, errors: [], startedAt: null, finishedAt: null };

function getScanState() {
  return { ...scanState, errors: scanState.errors.slice(-20) };
}

// "Artist - Title.mp4" -> { artist, title } using the folder name as the
// authoritative artist and stripping a redundant "Artist - " filename prefix.
function parseMetadata(folderArtist, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const prefix = `${folderArtist} - `;
  let title = base;
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) {
    title = base.slice(prefix.length);
  } else {
    const dashIdx = base.indexOf(' - ');
    if (dashIdx !== -1) {
      title = base.slice(dashIdx + 3);
    }
  }
  return { artist: folderArtist.trim(), title: title.trim() || base.trim() };
}

function runFfprobe(filepath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filepath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const val = parseFloat(stdout);
        resolve(Number.isFinite(val) ? val : null);
      }
    );
  });
}

function generateThumbnail(filepath, id, duration) {
  return new Promise((resolve) => {
    const seekTo = duration && duration > 4 ? Math.min(duration * 0.1, 30) : 1;
    const outPath = path.join(THUMB_DIR, `${id}.jpg`);
    execFile(
      'ffmpeg',
      ['-y', '-ss', String(seekTo), '-i', filepath, '-frames:v', '1', '-vf', 'scale=480:-1', outPath],
      { timeout: 20000 },
      (err) => {
        if (err) return resolve(null);
        resolve(`/thumbnails/${id}.jpg`);
      }
    );
  });
}

function walkLibrary() {
  const found = [];
  if (!fs.existsSync(LIBRARY_PATH)) return found;

  const artistDirs = fs.readdirSync(LIBRARY_PATH, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const dirent of artistDirs) {
    const artist = dirent.name;
    const artistPath = path.join(LIBRARY_PATH, artist);
    let files;
    try {
      files = fs.readdirSync(artistPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile()) continue;
      if (!VIDEO_EXTENSIONS.has(path.extname(f.name).toLowerCase())) continue;
      found.push({ artist, filepath: path.join(artistPath, f.name), filename: f.name });
    }
  }
  return found;
}

async function scanLibrary() {
  if (scanState.running) return scanState;
  scanState = { running: true, scanned: 0, total: 0, added: 0, removed: 0, errors: [], startedAt: new Date().toISOString(), finishedAt: null };

  try {
    const filesOnDisk = walkLibrary();
    scanState.total = filesOnDisk.length;
    const onDiskPaths = new Set(filesOnDisk.map((f) => f.filepath));

    const insertStmt = db.prepare(
      `INSERT INTO videos (artist, title, filepath, file_mtime) VALUES (@artist, @title, @filepath, @mtime)`
    );
    const existingStmt = db.prepare('SELECT id, filepath, file_mtime FROM videos');
    const updateThumbStmt = db.prepare('UPDATE videos SET thumbnail = ?, duration = ? WHERE id = ?');

    const existingByPath = new Map(existingStmt.all().map((r) => [r.filepath, r]));

    for (const file of filesOnDisk) {
      scanState.scanned++;
      const stat = fs.statSync(file.filepath);
      const mtime = stat.mtime.toISOString();
      const existing = existingByPath.get(file.filepath);

      let videoId;
      if (!existing) {
        const { artist, title } = parseMetadata(file.artist, file.filename);
        const info = insertStmt.run({ artist, title, filepath: file.filepath, mtime });
        videoId = info.lastInsertRowid;
        scanState.added++;
      } else if (existing.file_mtime !== mtime) {
        videoId = existing.id;
        db.prepare('UPDATE videos SET file_mtime = ? WHERE id = ?').run(mtime, videoId);
      } else {
        videoId = existing.id;
      }

      const thumbPath = path.join(THUMB_DIR, `${videoId}.jpg`);
      if (!fs.existsSync(thumbPath)) {
        try {
          const duration = await runFfprobe(file.filepath);
          const thumb = await generateThumbnail(file.filepath, videoId, duration);
          updateThumbStmt.run(thumb, duration, videoId);
        } catch (e) {
          scanState.errors.push(`${file.filepath}: ${e.message}`);
        }
      }
    }

    // Remove DB entries for files no longer on disk
    const removeStmt = db.prepare('DELETE FROM videos WHERE id = ?');
    for (const [filepath, row] of existingByPath) {
      if (!onDiskPaths.has(filepath)) {
        removeStmt.run(row.id);
        const thumbPath = path.join(THUMB_DIR, `${row.id}.jpg`);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        scanState.removed++;
      }
    }
  } catch (e) {
    scanState.errors.push(e.message);
  } finally {
    scanState.running = false;
    scanState.finishedAt = new Date().toISOString();
  }

  return scanState;
}

module.exports = { scanLibrary, getScanState, LIBRARY_PATH };
