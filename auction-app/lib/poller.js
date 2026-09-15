const fs = require('node:fs');
const path = require('node:path');
const { query, withTransaction, insertItemIfNew } = require('../db/db');
const { loadPreferences, matchesPreferences } = require('./matching');
const { notifyNewItem } = require('./slack');

const itemsPath = path.resolve(__dirname, '..', 'data', 'seed', 'items.json');

async function processNewItem(item) {
  const { rows: users } = await query(`
    SELECT u.id, u.name, p.categories, p.artists, p.keywords, p.min_price, p.max_price
    FROM users u JOIN preferences p ON p.user_id = u.id
  `);
  const matchedUsers = [];
  for (const user of users) {
    const prefs = await loadPreferences(user.id);
    if (matchesPreferences(item, prefs)) matchedUsers.push(user);
  }

  await withTransaction(async (client) => {
    for (const user of matchedUsers) {
      await client.query(`
        INSERT INTO notifications (user_id, item_id, sent_at)
        VALUES ($1, $2, NULL)
        ON CONFLICT (user_id, item_id) DO NOTHING
      `, [user.id, item.id]);
    }
  });

  return flushNotifications();
}

async function flushNotifications() {
  const { rows: pending } = await query(`
    SELECT n.user_id, n.item_id, u.name, i.title, i.artist, i.category,
           i.estimate_low, i.estimate_high, e.location, e.starts_at
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    JOIN items i ON i.id = n.item_id
    JOIN events e ON e.id = i.event_id
    WHERE n.sent_at IS NULL
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
      await query(
        'UPDATE notifications SET sent_at = now() WHERE user_id = $1 AND item_id = $2',
        [row.user_id, row.item_id]
      );
    } catch (error) {
      console.error(error);
    }
  }
}

async function tick() {
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
  for (const item of items) {
    if (await insertItemIfNew(item)) await processNewItem(item);
  }
  await flushNotifications();
}

function startPoller(intervalMs = 30000) {
  const run = () => {
    Promise.resolve(tick()).catch((error) => console.error(error));
  };
  const interval = setInterval(run, intervalMs);
  run();
  return interval;
}

module.exports = { startPoller, tick, flushNotifications, processNewItem };
