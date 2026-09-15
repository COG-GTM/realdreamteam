const fs = require('node:fs');
const path = require('node:path');
const { matchesPreferences } = require('./matching');
const { notifyNewItem } = require('./slack');
const { getUser, itemWithImages } = require('../db/db');

const seedPath = path.join(__dirname, '..', 'data', 'seed', 'items.json');

function seedItem(db, item) {
  const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(item.id);
  if (existing) return false;
  const add = db.prepare(`
    INSERT INTO items
    (id, sale_id, lot_number, title, artist, category, description, currency,
     estimate_low, estimate_high, starting_bid, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const addImage = db.prepare(
    'INSERT INTO item_images (item_id, position, url, credit) VALUES (?, ?, ?, ?)'
  );
  db.transaction(() => {
    add.run(
      item.id, item.saleId, item.lotNumber, item.title, item.artist, item.category,
      item.description, item.currency, item.estimateLow, item.estimateHigh,
      item.startingBid, item.sourceUrl
    );
    (item.images || []).forEach((image, index) => {
      addImage.run(item.id, index + 1, image.url, image.credit || null);
    });
  })();
  return true;
}

async function deliverPending(db) {
  const pending = db.prepare(`
    SELECT n.user_id, n.item_id, u.name, i.*, s.location, s.starts_at, s.title AS sale_title
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    JOIN items i ON i.id = n.item_id
    JOIN sales s ON s.id = i.sale_id
    WHERE n.sent_at IS NULL
    ORDER BY n.rowid
  `).all();
  let delivered = 0;
  for (const notification of pending) {
    const user = getUser(notification.user_id);
    const item = itemWithImages(notification.item_id);
    const sale = {
      location: notification.location,
      starts_at: notification.starts_at,
      title: notification.sale_title
    };
    if (await notifyNewItem(user, item, sale)) {
      db.prepare(
        'UPDATE notifications SET sent_at = CURRENT_TIMESTAMP WHERE user_id = ? AND item_id = ?'
      ).run(notification.user_id, notification.item_id);
      delivered += 1;
    }
  }
  return delivered;
}

async function processNewItem(db, item) {
  const inserted = seedItem(db, item);
  if (inserted) {
    const stored = itemWithImages(item.id);
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    const sale = db.prepare('SELECT id FROM sales WHERE id = ?').get(item.saleId);
    const addNotification = db.prepare(
      'INSERT OR IGNORE INTO notifications (user_id, item_id, sent_at) VALUES (?, ?, NULL)'
    );
    const addMatches = db.transaction(() => {
      for (const row of users) {
        const user = getUser(row.id);
        if (matchesPreferences(stored, user.preferences)) addNotification.run(row.id, item.id);
      }
    });
    addMatches();
  }
  await deliverPending(db);
  return db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE item_id = ? AND sent_at IS NOT NULL')
    .get(item.id).count;
}

async function runOnce(db) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sales SET status = 'open'
    WHERE status = 'upcoming' AND starts_at <= ?
  `).run(now);
  db.prepare(`
    UPDATE sales SET status = 'closed'
    WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= ?
  `).run(now);
  const items = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  for (const item of items) await processNewItem(db, item);
}

function start(db) {
  const timer = setInterval(() => {
    runOnce(db).catch((error) => console.error('[poller]', error.message));
  }, 30000);
  timer.unref();
  return timer;
}

module.exports = { start, processNewItem, runOnce };
