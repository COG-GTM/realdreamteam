const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { categories } = require('../lib/categories');
const { pickDefaultAvatar, defaultAvatarUsage } = require('../lib/avatars');

// Tests run against a separate database so they can truncate freely.
const databaseUrl = process.env.NODE_ENV === 'test'
  ? process.env.AUCTION_TEST_DATABASE_URL
  : process.env.AUCTION_DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
const pool = new Pool({
  host: database ? database.hostname : undefined,
  port: database ? Number(database.port || 5432) : undefined,
  database: database ? decodeURIComponent(database.pathname.slice(1)) : undefined,
  user: database ? decodeURIComponent(database.username) : undefined,
  password: process.env.AUCTION_DATABASE_PASSWORD || undefined,
  ssl: database && !['localhost', '127.0.0.1'].includes(database.hostname)
    ? { rejectUnauthorized: false }
    : undefined
});

function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function seedFiles() {
  const directory = path.join(__dirname, '..', 'data', 'seed');
  const read = (name, optional = false) => {
    const file = path.join(directory, name);
    if (optional && !fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  return {
    users: read('users.json'),
    houses: read('auction_houses.json'),
    auctions: read('auctions.json'),
    lots: read('lots.json'),
    bids: read('bids.json', true),
    favorites: read('favorites.json', true),
    preferences: read('preferences.json', true),
    notifications: read('notifications.json', true),
    shadowUsers: read('shadow_users.json', true)
  };
}

function statusFor(auction, now = new Date()) {
  const startsAt = new Date(auction.starts_at);
  const closesAt = auction.closes_at ? new Date(auction.closes_at) : null;
  if (startsAt > now) return 'upcoming';
  if (closesAt && closesAt <= now) return 'closed';
  return 'open';
}

async function findOne(client, text, params, message) {
  const result = await client.query(text, params);
  if (!result.rows[0]) throw new Error(message);
  return result.rows[0];
}

async function seedAll(client) {
  const data = seedFiles();
  const userIds = new Map();
  const lotIds = new Map();
  for (const [index, name] of categories.entries()) {
    await client.query(
      `INSERT INTO categories (name, position)
       VALUES ($1, $2)
       ON CONFLICT ((lower(name))) DO NOTHING`,
      [name, index + 1]
    );
  }
  const categoryNames = (await client.query('SELECT name FROM categories')).rows.map((row) => row.name);

  for (const house of data.houses) {
    await client.query(
      `INSERT INTO auction_houses (name, location, website, logo_url)
       VALUES ($1, $2, $3, $4)`,
      [house.name, house.location || null, house.website || null, house.logo_url || null]
    );
  }

  const avatarUsage = await defaultAvatarUsage(client);
  for (const user of data.users) {
    const avatarUrl = user.avatar_url || pickDefaultAvatar(user.name, avatarUsage);
    avatarUsage.set(avatarUrl, (avatarUsage.get(avatarUrl) || 0) + 1);
    const result = await client.query(
      `INSERT INTO users (name, email, avatar_url, banned)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.name, user.email || null, avatarUrl, user.banned || false]
    );
    const userId = result.rows[0].id;
    userIds.set(user.name, userId);
    if (user.preferences) {
      await client.query(
        `INSERT INTO preferences (user_id, categories, artists, keywords)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          user.preferences.categories || [],
          user.preferences.artists || [],
          user.preferences.keywords || []
        ]
      );
    }
  }

  // Simulated bidders (data/seed/shadow_users.json, optional): same rows as
  // normal users plus shadow=true and a persona for the simulator.
  for (const user of data.shadowUsers) {
    const avatarUrl = user.avatar_url || pickDefaultAvatar(user.name, avatarUsage);
    avatarUsage.set(avatarUrl, (avatarUsage.get(avatarUrl) || 0) + 1);
    const result = await client.query(
      `INSERT INTO users (name, email, avatar_url, banned, shadow, persona)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [user.name, user.email || null, avatarUrl, user.banned || false,
        user.persona ? JSON.stringify(user.persona) : null]
    );
    const userId = result.rows[0].id;
    userIds.set(user.name, userId);
    await client.query(
      `INSERT INTO preferences (user_id, categories, artists, keywords)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        (user.preferences && user.preferences.categories) || [],
        (user.preferences && user.preferences.artists) || [],
        (user.preferences && user.preferences.keywords) || []
      ]
    );
  }

  for (const preferences of data.preferences) {
    const userId = userIds.get(preferences.user);
    if (!userId) throw new Error(`Unknown preferences user "${preferences.user}"`);
    await client.query(
      `INSERT INTO preferences (user_id, categories, artists, keywords)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        preferences.categories || [],
        preferences.artists || [],
        preferences.keywords || []
      ]
    );
  }

  for (const auction of data.auctions) {
    const house = await findOne(
      client,
      'SELECT id FROM auction_houses WHERE name = $1',
      [auction.house],
      `Unknown auction house "${auction.house}"`
    );
    const result = await client.query(
      `INSERT INTO auctions
       (auction_house_id, house_ref, title, location, format, status, starts_at, closes_at, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        house.id,
        auction.house_ref,
        auction.title,
        auction.location || null,
        auction.format || 'live',
        statusFor(auction),
        auction.starts_at,
        auction.closes_at || null,
        auction.source_url || null
      ]
    );
    auction.id = result.rows[0].id;
  }

  for (const lot of data.lots) {
    if (!categoryNames.some((name) => name.toLowerCase() === String(lot.category).toLowerCase())) {
      throw new Error(`Unknown lot category "${lot.category}" for ${lot.title}`);
    }
    const auction = await findOne(
      client,
      `SELECT a.id FROM auctions a
       JOIN auction_houses h ON h.id = a.auction_house_id
       WHERE h.name = $1 AND a.house_ref = $2`,
      [lot.house, lot.house_ref],
      `Unknown auction "${lot.house}" / "${lot.house_ref}" for lot ${lot.lot_number}`
    );
    let winnerUserId = null;
    if (lot.winner) {
      winnerUserId = userIds.get(lot.winner);
      if (!winnerUserId) throw new Error(`Unknown winner "${lot.winner}" for ${lot.title}`);
    }
    const result = await client.query(
      `INSERT INTO lots
       (auction_id, lot_number, title, artist, category, description, currency,
        estimate_low, estimate_high, starting_bid, hammer_price, winner_user_id, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        auction.id,
        lot.lot_number,
        lot.title,
        lot.artist || null,
        lot.category,
        lot.description || null,
        lot.currency || 'USD',
        lot.estimate_low ?? null,
        lot.estimate_high ?? null,
        lot.starting_bid ?? null,
        lot.hammer_price ?? null,
        winnerUserId,
        lot.source_url || null
      ]
    );
    const lotId = result.rows[0].id;
    lotIds.set(`${lot.house}\u0000${lot.house_ref}\u0000${lot.lot_number}`, lotId);
    for (const [index, image] of (lot.images || []).entries()) {
      await client.query(
        `INSERT INTO lot_images (lot_id, position, url, credit)
         VALUES ($1, $2, $3, $4)`,
        [lotId, index + 1, image.url, image.credit || null]
      );
    }
  }

  for (const bid of data.bids) {
    const lotId = lotIds.get(`${bid.house}\u0000${bid.house_ref}\u0000${bid.lot_number}`);
    const userId = userIds.get(bid.user);
    if (!lotId) throw new Error(`Unknown lot for bid ${bid.house}/${bid.house_ref}/${bid.lot_number}`);
    if (!userId) throw new Error(`Unknown bidder "${bid.user}"`);
    await client.query(
      `INSERT INTO bids (lot_id, user_id, amount, placed_at) VALUES ($1, $2, $3, $4)`,
      [lotId, userId, bid.amount, bid.placed_at || new Date().toISOString()]
    );
  }

  for (const favorite of data.favorites) {
    const lotId = lotIds.get(`${favorite.house}\u0000${favorite.house_ref}\u0000${favorite.lot_number}`);
    const userId = userIds.get(favorite.user);
    if (!lotId) throw new Error(`Unknown lot for favorite ${favorite.house}/${favorite.house_ref}/${favorite.lot_number}`);
    if (!userId) throw new Error(`Unknown favorite user "${favorite.user}"`);
    await client.query(
      `INSERT INTO favorites (user_id, lot_id) VALUES ($1, $2)`,
      [userId, lotId]
    );
  }

  for (const notification of data.notifications) {
    const lotId = lotIds.get(`${notification.house}\u0000${notification.house_ref}\u0000${notification.lot_number}`);
    const userId = userIds.get(notification.user);
    if (!lotId) {
      throw new Error(`Unknown lot for notification ${notification.house}/${notification.house_ref}/${notification.lot_number}`);
    }
    if (!userId) throw new Error(`Unknown notification user "${notification.user}"`);
    await client.query(
      `INSERT INTO notifications
       (user_id, lot_id, kind, reason, created_at, read_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, lot_id, kind) DO NOTHING`,
      [
        userId,
        lotId,
        notification.kind,
        notification.reason,
        notification.created_at || new Date().toISOString(),
        notification.read_at || null
      ]
    );
  }
}

async function seedIfEmpty() {
  const result = await query('SELECT COUNT(*)::int AS count FROM auction_houses');
  if (result.rows[0].count > 0) return false;
  await withTransaction(seedAll);
  return true;
}

module.exports = { pool, query, withTransaction, seedIfEmpty, seedAll, seedFiles, statusFor, findOne };
