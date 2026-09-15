// DB-free checks: auction status derivation and the seed contract of data/seed/*.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const { statusFor, seedFiles } = require('./db');
const { categories } = require('../lib/categories');

const now = new Date('2026-09-15T12:00:00Z');

test('statusFor is upcoming before starts_at', () => {
  assert.equal(statusFor({ starts_at: '2026-09-16T00:00:00Z', closes_at: null }, now), 'upcoming');
});

test('statusFor is open between starts_at and closes_at, or with no close time', () => {
  assert.equal(statusFor({ starts_at: '2026-09-15T00:00:00Z', closes_at: '2026-09-16T00:00:00Z' }, now), 'open');
  assert.equal(statusFor({ starts_at: '2026-09-15T00:00:00Z', closes_at: null }, now), 'open');
});

test('statusFor is closed once closes_at has passed (inclusive)', () => {
  assert.equal(statusFor({ starts_at: '2026-09-14T00:00:00Z', closes_at: '2026-09-15T12:00:00Z' }, now), 'closed');
  assert.equal(statusFor({ starts_at: '2026-09-14T00:00:00Z', closes_at: '2026-09-15T00:00:00Z' }, now), 'closed');
});

test('seedFiles loads every seed file', () => {
  const data = seedFiles();
  for (const key of ['users', 'houses', 'auctions', 'lots', 'bids', 'favorites', 'preferences', 'notifications']) {
    assert.ok(Array.isArray(data[key]), `${key} should be an array`);
  }
  assert.ok(data.users.length > 0);
  assert.ok(data.houses.length > 0);
  assert.ok(data.auctions.length > 0);
  assert.ok(data.lots.length > 0);
});

// Mirrors the lookups seedAll performs, so a broken reference fails here
// instead of half-way through `npm run db:reset`.
test('seed data references resolve', () => {
  const data = seedFiles();
  const houses = new Set(data.houses.map((house) => house.name));
  const users = new Set(data.users.map((user) => user.name));
  const auctions = new Set(data.auctions.map((auction) => `${auction.house}/${auction.house_ref}`));
  const lots = new Set(data.lots.map((lot) => `${lot.house}/${lot.house_ref}/${lot.lot_number}`));
  const categoryNames = new Set(categories.map((name) => name.toLowerCase()));

  assert.equal(houses.size, data.houses.length, 'duplicate auction house names');
  assert.equal(users.size, data.users.length, 'duplicate user names');
  assert.equal(auctions.size, data.auctions.length, 'duplicate auction house/ref');
  assert.equal(lots.size, data.lots.length, 'duplicate lot numbers within an auction');

  for (const auction of data.auctions) {
    assert.ok(houses.has(auction.house), `auction ${auction.house_ref}: unknown house "${auction.house}"`);
    assert.ok(!Number.isNaN(new Date(auction.starts_at).getTime()), `auction ${auction.house_ref}: bad starts_at`);
  }
  for (const lot of data.lots) {
    assert.ok(auctions.has(`${lot.house}/${lot.house_ref}`), `lot "${lot.title}": unknown auction`);
    assert.ok(categoryNames.has(String(lot.category).toLowerCase()), `lot "${lot.title}": unknown category "${lot.category}"`);
    if (lot.winner) assert.ok(users.has(lot.winner), `lot "${lot.title}": unknown winner "${lot.winner}"`);
  }
  for (const [kind, rows] of Object.entries({ bids: data.bids, favorites: data.favorites, notifications: data.notifications })) {
    for (const row of rows) {
      assert.ok(users.has(row.user), `${kind}: unknown user "${row.user}"`);
      assert.ok(lots.has(`${row.house}/${row.house_ref}/${row.lot_number}`), `${kind}: unknown lot ${row.house}/${row.house_ref}/${row.lot_number}`);
    }
  }
  for (const row of data.preferences) {
    assert.ok(users.has(row.user), `preferences: unknown user "${row.user}"`);
  }
  const withInlinePrefs = new Set(data.users.filter((user) => user.preferences).map((user) => user.name));
  for (const row of data.preferences) {
    assert.ok(!withInlinePrefs.has(row.user), `preferences: "${row.user}" also has inline preferences (unique user_id)`);
  }
});

test('seed bids are positive whole numbers', () => {
  for (const bid of seedFiles().bids) {
    assert.ok(Number.isInteger(bid.amount) && bid.amount > 0, `bid by ${bid.user} on lot ${bid.lot_number}: ${bid.amount}`);
  }
});
