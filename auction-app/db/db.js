const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const appRoot = path.resolve(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'app.db'));

db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const insertUser = db.prepare('INSERT INTO users (id, name) VALUES (?, ?)');
const insertPreference = db.prepare(`
  INSERT INTO preferences (user_id, categories, artists, keywords, min_price, max_price)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertEvent = db.prepare(`
  INSERT INTO events (id, title, location, starts_at)
  VALUES (?, ?, ?, ?)
`);
const insertItem = db.prepare(`
  INSERT OR IGNORE INTO items
    (id, event_id, title, artist, category, estimate_low, estimate_high, image_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, 'data', 'seed', name), 'utf8'));
}

function insertItemIfNew(item) {
  const result = insertItem.run(
    item.id,
    item.eventId ?? item.event_id,
    item.title,
    item.artist,
    item.category,
    item.estimateLow ?? item.estimate_low,
    item.estimateHigh ?? item.estimate_high,
    item.imageUrl ?? item.image_url
  );
  return result.changes > 0;
}

function seedIfEmpty() {
  const hasUsers = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasUsers) return false;

  const users = readSeed('users.json');
  const events = readSeed('events.json');
  const items = readSeed('items.json');

  db.transaction(() => {
    for (const user of users) {
      const prefs = user.preferences || {};
      insertUser.run(user.id, user.name);
      insertPreference.run(
        user.id,
        JSON.stringify(prefs.categories || []),
        JSON.stringify(prefs.artists || []),
        JSON.stringify(prefs.keywords || []),
        prefs.minPrice ?? null,
        prefs.maxPrice ?? null
      );
    }
    for (const event of events) {
      insertEvent.run(event.id, event.title, event.location, event.startsAt ?? event.starts_at);
    }
    for (const item of items) insertItemIfNew(item);
  })();
  return true;
}

seedIfEmpty();

module.exports = { db, seedIfEmpty, insertItemIfNew };
