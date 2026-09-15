const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { integrityReport } = require('../../lib/category-admin');
const { categories } = require('../../lib/categories');

const { describeDb, db, rows } = helper;

async function count(table) {
  return (await rows(`SELECT COUNT(*)::int AS count FROM ${table}`))[0].count;
}

describeDb('seed data', (it) => {
  it('seedAll loads every seed file into a consistent database', async () => {
    const data = db.seedFiles();
    await db.withTransaction(db.seedAll);

    assert.equal(await count('auction_houses'), data.houses.length);
    assert.equal(await count('users'), data.users.length);
    assert.equal(await count('auctions'), data.auctions.length);
    assert.equal(await count('lots'), data.lots.length);
    assert.equal(await count('bids'), data.bids.length);
    assert.equal(await count('favorites'), data.favorites.length);
    assert.equal(await count('lot_images'), data.lots.reduce((sum, lot) => sum + (lot.images || []).length, 0));
    assert.equal(await count('categories'), categories.length);
    assert.equal(await count('preferences'),
      data.users.filter((user) => user.preferences).length + data.preferences.length);

    const report = await integrityReport();
    assert.deepEqual(report, { unmatchedLots: [], unmatchedPreferences: [] });

    const auctionStatuses = await rows('SELECT status, starts_at, closes_at FROM auctions');
    for (const auction of auctionStatuses) {
      assert.equal(auction.status, db.statusFor(auction), 'status derived from the seed dates');
    }
  });

  it('seedIfEmpty seeds once and is then a no-op', async () => {
    assert.equal(await db.seedIfEmpty(), true);
    const lots = await count('lots');
    assert.equal(await db.seedIfEmpty(), false);
    assert.equal(await count('lots'), lots);
  });
});
