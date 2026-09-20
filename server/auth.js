const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
  );
`);

// On first ever start, seed a single login from AUTH_USERNAME/AUTH_PASSWORD.
// If AUTH_PASSWORD isn't set, generate one and print it once so the app is
// never reachable with a blank or default password.
function ensureDefaultUser() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  const username = process.env.AUTH_USERNAME || 'admin';
  let password = process.env.AUTH_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

  console.log('='.repeat(64));
  console.log('No login found — created one:');
  console.log(`  username: ${username}`);
  console.log(generated
    ? `  password: ${password}   (generated — set AUTH_PASSWORD to choose your own)`
    : '  password: <value of AUTH_PASSWORD>');
  console.log('='.repeat(64));
}

function verifyCredentials(username, password) {
  if (!username || !password) return null;
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user) return null;
  return bcrypt.compareSync(password, user.password_hash) ? user : null;
}

module.exports = { ensureDefaultUser, verifyCredentials };
