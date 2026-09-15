const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { runOnce } = require('../../lib/poller');

const { describeDb, createHouse, createUser, createAuction, createLot, createBid, rows, HOUR } = helper;

async function statuses() {
  return Object.fromEntries((await rows('SELECT title, status FROM auctions')).map((row) => [row.title, row.status]));
}

describeDb('poller.runOnce', (it) => {
  it('opens auctions whose start time has passed and closes those past their close time', async (t) => {
    t.mock.method(console, 'log', () => {});
    await createHouse();
    const dueToOpen = await createAuction({ title: 'Due to open', status: 'upcoming', starts_at: new Date(Date.now() - 60000), closes_at: new Date(Date.now() + HOUR) });
    await createAuction({ title: 'Still upcoming', status: 'upcoming' });
    const dueToClose = await createAuction({ title: 'Due to close', starts_at: new Date(Date.now() - 2 * HOUR), closes_at: new Date(Date.now() - 60000) });
    await createAuction({ title: 'Still open' });
    await createAuction({ title: 'Open-ended', closes_at: null });
    const bidder = await createUser();
    const lot = await createLot({ auction_id: dueToClose.id });
    await createBid(lot.id, bidder.id, 42);

    await runOnce();

    assert.deepEqual(await statuses(), {
      'Due to open': 'open',
      'Still upcoming': 'upcoming',
      'Due to close': 'closed',
      'Still open': 'open',
      'Open-ended': 'open'
    });
    assert.equal((await rows('SELECT winner_user_id FROM lots WHERE id = $1', [lot.id]))[0].winner_user_id, String(bidder.id));
    assert.deepEqual(console.log.mock.calls.map((call) => call.arguments[0]), ['[poller] closed "Due to close": 1 sold, 0 unsold']);
    assert.ok(dueToOpen.id);
  });

  it('seeds the demo data when the database is empty', async () => {
    await runOnce();
    const [{ count }] = await rows('SELECT COUNT(*)::int AS count FROM auction_houses');
    assert.ok(count > 0);
    const [{ lots }] = await rows('SELECT COUNT(*)::int AS lots FROM lots');
    assert.ok(lots > 0);
  });
});
