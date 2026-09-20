const path = require('path');

const TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
};

function lookup(filepath) {
  return TYPES[path.extname(filepath).toLowerCase()] || 'application/octet-stream';
}

module.exports = { lookup };
