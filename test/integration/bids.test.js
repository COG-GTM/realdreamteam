const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { placeBid } = require('../../lib/bids');

const { describeDb, createUser, createLot, createAuction, createBid, rows, notificationsFor } = helper;

describeDb('placeBid', (it) => {
  it('records a first bid at or above the starting bid', async () => {
    const user = await createUser();
    const lot = await createLot({ starting_bid: 100 });
    assert.deepEqual(await placeBid({ userId: user.id, lotId: lot.id, amount: '100' }), { ok: true });
    const bids = await rows('SELECT user_id, amount FROM bids WHERE lot_id = $1', [lot.id]);
    assert.equal(bids.length, 1);
    assert.equal(Number(bids[0].amount), 100);
    assert.deepEqual(await notificationsFor(user.id), []);
  });

  it('rejects a first bid below the starting bid and stores nothing', async () => {
    const user = await createUser();
    const lot = await createLot({ starting_bid: 100 });
    const result = await placeBid({ userId: user.id, lotId: lot.id, amount: '99' });
    assert.equal(result.ok, false);
    assert.match(result.error, /at least the starting bid of 100/);
    assert.equal((await rows('SELECT 1 FROM bids')).length, 0);
  });

  it('requires a higher amount than the current high bid', async () => {
    const [ann, bob] = [await createUser(), await createUser()];
    const lot = await createLot();
    await createBid(lot.id, ann.id, 500);
    const equal = await placeBid({ userId: bob.id, lotId: lot.id, amount: '500' });
    assert.equal(equal.ok, false);
    assert.match(equal.error, /higher than the current high bid of 500/);
    assert.deepEqual(await placeBid({ userId: bob.id, lotId: lot.id, amount: '501' }), { ok: true });
  });

  it('notifies the previous high bidder that they were outbid', async () => {
    const ann = await createUser({ name: 'Ann' });
    const bob = await createUser({ name: 'Bob' });
    const lot = await createLot({ title: 'Blue Painting' });
    await createBid(lot.id, ann.id, 500);
    await placeBid({ userId: bob.id, lotId: lot.id, amount: '600' });
    const [note] = await notificationsFor(ann.id);
    assert.equal(note.kind, 'outbid');
    assert.equal(note.reason, 'Bob bid 600 on "Blue Painting"');
    assert.equal(note.read_at, null);
    assert.deepEqual(await notificationsFor(bob.id), []);
  });

  it('refreshes an existing outbid notification instead of adding a second one', async () => {
    const ann = await createUser({ name: 'Ann' });
    const bob = await createUser({ name: 'Bob' });
    const lot = await createLot();
    await createBid(lot.id, ann.id, 500);
    await placeBid({ userId: bob.id, lotId: lot.id, amount: '600' });
    await helper.db.query('UPDATE notifications SET read_at = now()');
    await placeBid({ userId: ann.id, lotId: lot.id, amount: '700' });
    await placeBid({ userId: bob.id, lotId: lot.id, amount: '800' });
    const notes = await notificationsFor(ann.id);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].reason, 'Bob bid 800 on "Untitled"');
    assert.equal(notes[0].read_at, null, 'refreshed notification is unread again');
  });

  it('does not notify a bidder who raises their own high bid', async () => {
    const ann = await createUser();
    const lot = await createLot();
    await createBid(lot.id, ann.id, 500);
    assert.deepEqual(await placeBid({ userId: ann.id, lotId: lot.id, amount: '600' }), { ok: true });
    assert.deepEqual(await notificationsFor(ann.id), []);
  });

  it('refuses banned and unknown users', async () => {
    const banned = await createUser({ banned: true });
    const lot = await createLot();
    assert.deepEqual(await placeBid({ userId: banned.id, lotId: lot.id, amount: '10' }),
      { ok: false, error: 'You are not allowed to bid.' });
    assert.deepEqual(await placeBid({ userId: 999999, lotId: lot.id, amount: '10' }),
      { ok: false, error: 'You are not allowed to bid.' });
  });

  it('reports a missing lot', async () => {
    const user = await createUser();
    assert.deepEqual(await placeBid({ userId: user.id, lotId: 999999, amount: '10' }),
      { ok: false, error: 'Lot not found.' });
  });

  it('refuses bids on upcoming and closed auctions', async () => {
    const user = await createUser();
    for (const status of ['upcoming', 'closed']) {
      const auction = await createAuction({ status });
      const lot = await createLot({ auction_id: auction.id });
      assert.deepEqual(await placeBid({ userId: user.id, lotId: lot.id, amount: '10' }),
        { ok: false, error: 'Bidding is closed for this auction.' });
    }
  });

  it('serialises concurrent bids on the same lot so only one can win a tie', async () => {
    const bidders = await Promise.all([1, 2, 3, 4].map(() => createUser()));
    const lot = await createLot();
    const results = await Promise.all(bidders.map((user) => placeBid({ userId: user.id, lotId: lot.id, amount: '300' })));
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok).length, 3);
    assert.equal((await rows('SELECT 1 FROM bids WHERE lot_id = $1', [lot.id])).length, 1);
  });
});
