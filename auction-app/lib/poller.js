const fs = require('node:fs');
const path = require('node:path');
const { insertItemIfNew } = require('../db/db');
const { loadPreferences, matchesPreferences } = require('./matching');
const { notifyNewItem } = require('./slack');

const itemsPath = path.resolve(__dirname, '..', 'data', 'seed', 'items.json');

function processNewItem(db, item) {
  const users = db.prepare(`
    SELECT u.id, u.name, p.categories, p.artists, p.keywords, p.min_price, p.max_price
    FROM users u JOIN preferences p ON p.user_id = u.id
  `).all();
  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO notifications (user_id, item_id, sent_at)
    VALUES (?, ?, NULL)
  `);

  db.transaction(() => {
    for (const user of users) {
      const prefs = loadPreferences(db, user.id);
      if (matchesPreferences(item, prefs)) insertNotification.run(user.id, item.id);
    }
  })();

  return flushNotifications(db);
}

async function flushNotifications(db) {
  const pending = db.prepare(`
    SELECT n.user_id, n.item_id, u.name, i.title, i.artist, i.category,
           i.estimate_low, i.estimate_high, e.location, e.starts_at
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    JOIN items i ON i.id = n.item_id
    JOIN events e ON e.id = i.event_id
    WHERE n.sent_at IS NULL
  `).all();
  const markSent = db.prepare(`
    UPDATE notifications SET sent_at = ? WHERE user_id = ? AND item_id = ?
  `);

  for (const row of pending) {
    const user = { id: row.user_id, name: row.name };
    const item = {
      id: row.item_id,
      title: row.title,
      artist: row.artist,
      category: row.category,
      estimateLow: row.estimate_low,
      estimateHigh: row.estimate_high
    };
    const event = { location: row.location, starts_at: row.starts_at };
    try {
      await notifyNewItem(user, item, event);
      markSent.run(new Date().toISOString(), row.user_id, row.item_id);
    } catch (error) {
      console.error(error);
    }
  }
}

async function tick(db) {
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
  for (const item of items) {
    if (insertItemIfNew(item)) await processNewItem(db, item);
  }
  await flushNotifications(db);
}

function startPoller(db, intervalMs = 30000) {
  const run = () => {
    Promise.resolve(tick(db)).catch((error) => console.error(error));
  };
  const interval = setInterval(run, intervalMs);
  run();
  return interval;
}

module.exports = { startPoller, tick, flushNotifications, processNewItem };
