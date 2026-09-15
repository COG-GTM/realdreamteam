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
        (SELECT count(*) FROM events) AS events,
        (SELECT count(*) FROM items) AS items
    `);
    assert.equal(Number(counts.rows[0].users), 6);
    assert.equal(Number(counts.rows[0].events), 3);
    assert.ok(Number(counts.rows[0].items) >= 18);
    assert.equal(await insertItemIfNew({ id: 'lot-101' }), false);
  } finally {
    await pool.end();
  }
});
