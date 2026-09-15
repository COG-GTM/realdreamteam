// Background timer: every POLL_SECONDS it opens auctions whose starts_at has
// passed and closes auctions whose closes_at has passed. Errors are logged and
// the process keeps running.
const { query, seedIfEmpty } = require('../db/db');
const { closeAuction } = require('./close');

async function runOnce() {
  await seedIfEmpty();

  await query(
    `UPDATE auctions SET status = 'open'
     WHERE status = 'upcoming' AND starts_at <= now()`
  );

  const due = await query(
    `SELECT id, title FROM auctions
     WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= now()`
  );
  for (const auction of due.rows) {
    const result = await closeAuction(auction.id);
    if (result.closed) {
      console.log(`[poller] closed "${auction.title}": ${result.lotsSold} sold, ${result.lotsUnsold} unsold`);
    }
  }
}

function start() {
  const seconds = Number(process.env.POLL_SECONDS || 5);
  const timer = setInterval(() => runOnce().catch((error) => console.error('[poller]', error.message)), seconds * 1000);
  timer.unref();
  return timer;
}

module.exports = { start, runOnce };
