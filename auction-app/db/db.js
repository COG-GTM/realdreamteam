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

const parsedDatabaseUrl = new URL(databaseUrl);
const databasePassword = process.env.AUCTION_DATABASE_PASSWORD || undefined;
if (!parsedDatabaseUrl.password && !databasePassword) {
  const message = 'AUCTION_DATABASE_PASSWORD must be set when the database URL has no password';
  console.error(message);
  throw new Error(message);
}

const databaseHost = parsedDatabaseUrl.hostname;
const poolConfig = {
  connectionString: databasePassword ? undefined : databaseUrl,
  password: databasePassword,
  ssl: databaseHost === 'localhost' || databaseHost === '127.0.0.1'
    ? false
    : { rejectUnauthorized: false }
};

if (databasePassword) {
  poolConfig.user = decodeURIComponent(parsedDatabaseUrl.username);
  poolConfig.host = parsedDatabaseUrl.hostname;
  poolConfig.port = parsedDatabaseUrl.port || undefined;
  poolConfig.database = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
}

const pool = new Pool(poolConfig);

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
    const auctionHouses = readSeed('auction_houses.json');
    const sales = readSeed('sales.json');
    const items = readSeed('items.json');

    for (const auctionHouse of auctionHouses) {
      await connection.query(
        'INSERT INTO auction_houses (id, name, website) VALUES ($1, $2, $3)',
        [auctionHouse.id, auctionHouse.name, auctionHouse.website]
      );
    }

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
    for (const sale of sales) {
      await connection.query(
        `INSERT INTO sales
          (id, auction_house_id, sale_number, title, location, sale_type, status, starts_at, closes_at, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sale.id,
          sale.auctionHouseId ?? sale.auction_house_id,
          sale.saleNumber ?? sale.sale_number,
          sale.title,
          sale.location,
          sale.saleType ?? sale.sale_type,
          sale.status,
          sale.startsAt ?? sale.starts_at,
          sale.closesAt ?? sale.closes_at,
          sale.sourceUrl ?? sale.source_url
        ]
      );
    }
    for (const item of items) await insertItemIfNew(item, connection);
    return true;
  };

  return client ? seed(client) : withTransaction(seed);
}

async function insertItemIfNew(item, client) {
  const connection = client || pool;
  const existing = await connection.query('SELECT 1 FROM items WHERE id = $1', [item.id]);
  if (existing.rows.length > 0) return false;

  const result = await connection.query(
    `INSERT INTO items
      (id, sale_id, lot_number, title, artist, category, description, currency,
       estimate_low, estimate_high, starting_bid, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [
      item.id,
      item.saleId ?? item.sale_id,
      item.lotNumber ?? item.lot_number,
      item.title,
      item.artist,
      item.category,
      item.description,
      item.currency ?? 'USD',
      item.estimateLow ?? item.estimate_low,
      item.estimateHigh ?? item.estimate_high,
      item.startingBid ?? item.starting_bid ?? item.estimateLow ?? item.estimate_low,
      item.sourceUrl ?? item.source_url
    ]
  );
  if (result.rowCount !== 1) return false;

  for (const [index, image] of (item.images || []).entries()) {
    await connection.query(
      `INSERT INTO item_images (item_id, position, url, credit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id, position) DO NOTHING`,
      [item.id, index + 1, image.url, image.credit]
    );
  }

  return true;
}

async function init() {
  await query(fs.readFileSync(schemaPath, 'utf8'));
  await seedIfEmpty();
}

module.exports = { pool, query, withTransaction, init, seedIfEmpty, insertItemIfNew };
