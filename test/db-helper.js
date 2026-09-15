// Shared setup for tests that need a real Postgres database.
//
// Tests run against AUCTION_TEST_DATABASE_URL (never the app database) so they
// can truncate tables between cases. When that database is not reachable the
// suite is reported as skipped rather than failed, so `npm test` still passes
// on a machine without Postgres.
//
//   createdb -p 5433 rdt_test && psql -p 5433 -d rdt_test -f db/schema.sql
process.env.NODE_ENV = 'test';
require('dotenv').config({ override: true });
process.env.AUCTION_TEST_DATABASE_URL ||= 'postgres://postgres@localhost:5433/rdt_test';
process.env.SIM_ENABLED = 'false';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/db');

const LOCK_KEY = 20260915;
let availability = null;
let lockClient = null;

// node --test runs files in parallel processes that all share the one test
// database, so each file holds a session-level advisory lock while it runs.
async function acquireLock() {
  lockClient = await db.pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
}

// Each test file is its own process; release the lock and close the pool once it has finished.
test.after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    lockClient.release();
  }
  await db.pool.end().catch(() => {});
});

async function databaseAvailable() {
  if (availability) return availability;
  availability = db.query('SELECT 1 FROM auction_houses LIMIT 0')
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, reason: error.message }));
  return availability;
}

// Empties every table and resets the identity sequences.
async function resetDatabase() {
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'reset.sql'), 'utf8'));
}

// describeDb('placeBid', (it) => { it('...', async () => {}); })
// Registers the group with node:test; every case gets an empty database.
// The whole group is skipped (with the reason) when the database is unreachable.
function describeDb(name, define) {
  test.describe(name, () => {
    let skipReason = null;
    test.before(async () => {
      const status = await databaseAvailable();
      if (!status.ok) skipReason = `no test database (${status.reason})`;
      else if (!lockClient) await acquireLock();
    });
    const it = (title, fn) => test.it(title, async (t) => {
      if (skipReason) return t.skip(skipReason);
      await resetDatabase();
      return fn(t);
    });
    define(it);
  });
}

// --- fixture builders -------------------------------------------------------
// Each returns the inserted row. Defaults are chosen so a test only has to
// state what it cares about.

async function createHouse(fields = {}) {
  const result = await db.query(
    'INSERT INTO auction_houses (name, location) VALUES ($1, $2) RETURNING *',
    [fields.name || `House ${Date.now()}${Math.random()}`, fields.location || null]
  );
  return result.rows[0];
}

async function createUser(fields = {}) {
  const result = await db.query(
    'INSERT INTO users (name, email, banned) VALUES ($1, $2, $3) RETURNING *',
    [fields.name || `User ${Math.random().toString(36).slice(2)}`, fields.email || null, fields.banned || false]
  );
  return result.rows[0];
}

async function setPreferences(userId, { categories = [], artists = [], keywords = [] } = {}) {
  await db.query(
    `INSERT INTO preferences (user_id, categories, artists, keywords) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET categories = $2, artists = $3, keywords = $4`,
    [userId, categories, artists, keywords]
  );
}

const HOUR = 60 * 60 * 1000;

async function createAuction(fields = {}) {
  const house = fields.auction_house_id ? { id: fields.auction_house_id } : await createHouse();
  const status = fields.status || 'open';
  const now = Date.now();
  const startsAt = fields.starts_at || new Date(status === 'upcoming' ? now + HOUR : now - HOUR);
  const defaultClose = { upcoming: now + 2 * HOUR, open: now + HOUR, closed: now - HOUR / 2 }[status];
  const closesAt = fields.closes_at === undefined ? new Date(defaultClose) : fields.closes_at;
  const result = await db.query(
    `INSERT INTO auctions (auction_house_id, house_ref, title, format, status, starts_at, closes_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [house.id, fields.house_ref || `REF-${Math.random().toString(36).slice(2)}`, fields.title || 'Test Sale',
      fields.format || 'timed', status, startsAt, closesAt]
  );
  return result.rows[0];
}

async function createLot(fields = {}) {
  const auctionId = fields.auction_id || (await createAuction()).id;
  const result = await db.query(
    `INSERT INTO lots (auction_id, lot_number, title, artist, category, description, currency, estimate_low, estimate_high, starting_bid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [auctionId, fields.lot_number || 1, fields.title || 'Untitled', fields.artist || null,
      fields.category || 'Contemporary Art', fields.description || null, fields.currency || 'USD',
      fields.estimate_low === undefined ? null : fields.estimate_low,
      fields.estimate_high === undefined ? null : fields.estimate_high,
      fields.starting_bid === undefined ? null : fields.starting_bid]
  );
  return result.rows[0];
}

async function createCategory(name, fields = {}) {
  const position = fields.position
    || (await db.query('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM categories')).rows[0].next;
  const result = await db.query(
    'INSERT INTO categories (name, position, active) VALUES ($1, $2, $3) RETURNING *',
    [name, position, fields.active === undefined ? true : fields.active]
  );
  return result.rows[0];
}

async function createBid(lotId, userId, amount, placedAt = new Date()) {
  const result = await db.query(
    'INSERT INTO bids (lot_id, user_id, amount, placed_at) VALUES ($1, $2, $3, $4) RETURNING *',
    [lotId, userId, amount, placedAt]
  );
  return result.rows[0];
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function notificationsFor(userId) {
  return rows(
    'SELECT user_id, lot_id, kind, reason, read_at FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId]
  );
}

module.exports = {
  db, describeDb, resetDatabase, databaseAvailable,
  createHouse, createUser, setPreferences, createAuction, createLot, createCategory, createBid,
  rows, notificationsFor, HOUR
};
