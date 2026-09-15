const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const appRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(__dirname, 'schema.sql');
const databaseUrl = process.env.AUCTION_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  const message = 'AUCTION_DATABASE_URL or DATABASE_URL must be set before starting auction-app';
  console.error(message);
  throw new Error(message);
}

const databaseHost = new URL(databaseUrl).hostname;
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseHost === 'localhost' || databaseHost === '127.0.0.1'
    ? false
    : { rejectUnauthorized: false }
});

function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(appRoot, 'data', 'seed', name), 'utf8'));
}

async function seedIfEmpty(client) {
  const seed = async (connection) => {
    const { rows } = await connection.query('SELECT 1 FROM users LIMIT 1');
    if (rows.length > 0) return false;

    const users = readSeed('users.json');
    const events = readSeed('events.json');
    const items = readSeed('items.json');

    for (const user of users) {
      const prefs = user.preferences || {};
      await connection.query(
        'INSERT INTO users (id, name) VALUES ($1, $2)',
        [user.id, user.name]
      );
      await connection.query(
        `INSERT INTO preferences
          (user_id, categories, artists, keywords, min_price, max_price)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          user.id,
          JSON.stringify(prefs.categories || []),
          JSON.stringify(prefs.artists || []),
          JSON.stringify(prefs.keywords || []),
          prefs.minPrice ?? null,
          prefs.maxPrice ?? null
        ]
      );
    }
    for (const event of events) {
      await connection.query(
        'INSERT INTO events (id, title, location, starts_at) VALUES ($1, $2, $3, $4)',
        [event.id, event.title, event.location, event.startsAt ?? event.starts_at]
      );
    }
    for (const item of items) await insertItemIfNew(item, connection);
    return true;
  };

  return client ? seed(client) : withTransaction(seed);
}

async function insertItemIfNew(item, client) {
  const connection = client || pool;
  const result = await connection.query(
    `INSERT INTO items
      (id, event_id, title, artist, category, estimate_low, estimate_high, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      item.id,
      item.eventId ?? item.event_id,
      item.title,
      item.artist,
      item.category,
      item.estimateLow ?? item.estimate_low,
      item.estimateHigh ?? item.estimate_high,
      item.imageUrl ?? item.image_url
    ]
  );
  return result.rowCount === 1;
}

async function init() {
  await query(fs.readFileSync(schemaPath, 'utf8'));
  await seedIfEmpty();
}

module.exports = { pool, query, withTransaction, init, seedIfEmpty, insertItemIfNew };
