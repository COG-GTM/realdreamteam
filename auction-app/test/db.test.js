const test = require('node:test');
const assert = require('node:assert/strict');

test('initializes and seeds Postgres', {
  skip: !process.env.AUCTION_DATABASE_URL,
  reason: 'AUCTION_DATABASE_URL is not set'
}, async () => {
  const { init, query, insertItemIfNew, pool } = require('../db/db');
  try {
    await init();

    const counts = await query(`
      SELECT
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM auction_houses) AS auction_houses,
        (SELECT count(*) FROM sales) AS sales,
        (SELECT count(*) FROM items) AS items,
        (SELECT count(*) FROM item_images) AS item_images
    `);
    assert.equal(Number(counts.rows[0].users), 6);
    assert.equal(Number(counts.rows[0].auction_houses), 4);
    assert.equal(Number(counts.rows[0].sales), 3);
    assert.equal(Number(counts.rows[0].items), 18);
    assert.ok(Number(counts.rows[0].item_images) >= 18);
    assert.equal(await insertItemIfNew({ id: 'lot-101' }), false);
  } finally {
    await pool.end();
  }
});
