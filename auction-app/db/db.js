const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const appDir = path.join(__dirname, '..');
const db = new Database(path.join(appDir, 'data', 'app.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(appDir, 'data', 'seed', name), 'utf8'));
}

function seedDatabase() {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) return;

  const users = readSeed('users.json');
  const houses = readSeed('auction_houses.json');
  const sales = readSeed('sales.json');
  const items = readSeed('items.json');

  const seed = db.transaction(() => {
    const addHouse = db.prepare('INSERT INTO auction_houses (id, name, website) VALUES (?, ?, ?)');
    const addUser = db.prepare('INSERT INTO users (id, name) VALUES (?, ?)');
    const addPreference = db.prepare(
      'INSERT INTO preferences (user_id, categories, artists, keywords, min_price, max_price) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const addSale = db.prepare(
      `INSERT INTO sales
       (id, auction_house_id, sale_number, title, location, sale_type, status, starts_at, closes_at, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const addItem = db.prepare(
      `INSERT INTO items
       (id, sale_id, lot_number, title, artist, category, description, currency,
        estimate_low, estimate_high, starting_bid, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const addImage = db.prepare(
      'INSERT INTO item_images (item_id, position, url, credit) VALUES (?, ?, ?, ?)'
    );

    for (const house of houses) addHouse.run(house.id, house.name, house.website);
    for (const user of users) {
      const preferences = user.preferences || {};
      addUser.run(user.id, user.name);
      addPreference.run(
        user.id,
        JSON.stringify(preferences.categories || []),
        JSON.stringify(preferences.artists || []),
        JSON.stringify(preferences.keywords || []),
        preferences.minPrice ?? null,
        preferences.maxPrice ?? null
      );
    }
    for (const sale of sales) {
      addSale.run(
        sale.id, sale.auctionHouseId, sale.saleNumber, sale.title, sale.location,
        sale.saleType, sale.status, sale.startsAt, sale.closesAt, sale.sourceUrl
      );
    }
    for (const item of items) {
      addItem.run(
        item.id, item.saleId, item.lotNumber, item.title, item.artist, item.category,
        item.description, item.currency, item.estimateLow, item.estimateHigh,
        item.startingBid, item.sourceUrl
      );
      (item.images || []).forEach((image, index) => {
        addImage.run(item.id, index + 1, image.url, image.credit || null);
      });
    }
  });

  seed();
}

function parseJsonArray(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function getUser(id) {
  const user = db.prepare(`
    SELECT u.*, p.categories, p.artists, p.keywords, p.min_price, p.max_price
    FROM users u LEFT JOIN preferences p ON p.user_id = u.id
    WHERE u.id = ?
  `).get(id);
  if (!user) return null;
  user.preferences = {
    categories: parseJsonArray(user.categories),
    artists: parseJsonArray(user.artists),
    keywords: parseJsonArray(user.keywords),
    minPrice: user.min_price,
    maxPrice: user.max_price
  };
  return user;
}

function highBid(itemId) {
  return db.prepare(`
    SELECT b.amount, b.user_id, u.name, counts.count
    FROM bids b
    JOIN users u ON u.id = b.user_id
    JOIN (SELECT item_id, COUNT(*) AS count FROM bids WHERE item_id = ? GROUP BY item_id) counts
      ON counts.item_id = b.item_id
    WHERE b.item_id = ?
    ORDER BY b.amount DESC, b.id DESC
    LIMIT 1
  `).get(itemId, itemId) || null;
}

function itemWithImages(id) {
  const item = db.prepare(`
    SELECT i.*, s.title AS sale_title, s.location, s.status AS sale_status,
           s.starts_at, s.closes_at, s.source_url AS sale_source_url,
           h.name AS auction_house
    FROM items i
    JOIN sales s ON s.id = i.sale_id
    JOIN auction_houses h ON h.id = s.auction_house_id
    WHERE i.id = ?
  `).get(id);
  if (!item) return null;
  item.images = db.prepare(
    'SELECT position, url, credit FROM item_images WHERE item_id = ? ORDER BY position'
  ).all(id);
  return item;
}

seedDatabase();

module.exports = { db, getUser, highBid, itemWithImages, seedDatabase };
