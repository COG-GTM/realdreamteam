const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { closeAuction } = require('../../lib/close');

const { describeDb, createUser, createLot, createAuction, createBid, rows, notificationsFor, HOUR } = helper;

async function lotRow(id) {
  return (await rows('SELECT hammer_price, winner_user_id FROM lots WHERE id = $1', [id]))[0];
}

describeDb('closeAuction', (it) => {
  it('closes an open auction, records the winner and notifies every bidder', async () => {
    const ann = await createUser({ name: 'Ann' });
    const bob = await createUser({ name: 'Bob' });
    const auction = await createAuction();
    const lot = await createLot({ auction_id: auction.id, currency: 'GBP' });
    await createBid(lot.id, ann.id, 1000, new Date(Date.now() - 2000));
    await createBid(lot.id, bob.id, 1500, new Date(Date.now() - 1000));

    assert.deepEqual(await closeAuction(auction.id), { closed: true, lotsSold: 1, lotsUnsold: 0 });

    assert.deepEqual(await lotRow(lot.id), { hammer_price: '1500.00', winner_user_id: String(bob.id) });
    assert.equal((await rows('SELECT status FROM auctions WHERE id = $1', [auction.id]))[0].status, 'closed');
    assert.deepEqual((await notificationsFor(bob.id)).map((note) => [note.kind, note.reason]),
      [['sold', 'Sold to Bob for £1,500 — congratulations!']]);
    assert.deepEqual((await notificationsFor(ann.id)).map((note) => [note.kind, note.reason]),
      [['sold', 'Sold to Bob for £1,500 — better luck next time']]);
  });

  it('gives a tie to the earliest bid', async () => {
    const first = await createUser({ name: 'First' });
    const second = await createUser({ name: 'Second' });
    const auction = await createAuction();
    const lot = await createLot({ auction_id: auction.id });
    await createBid(lot.id, second.id, 700, new Date('2026-09-15T10:00:01Z'));
    await createBid(lot.id, first.id, 700, new Date('2026-09-15T10:00:00Z'));
    await closeAuction(auction.id);
    assert.equal((await lotRow(lot.id)).winner_user_id, String(first.id));
  });

  it('counts lots without bids as unsold and leaves them untouched', async () => {
    const ann = await createUser();
    const auction = await createAuction();
    const sold = await createLot({ auction_id: auction.id, lot_number: 1 });
    const unsold = await createLot({ auction_id: auction.id, lot_number: 2 });
    await createBid(sold.id, ann.id, 50);
    assert.deepEqual(await closeAuction(auction.id), { closed: true, lotsSold: 1, lotsUnsold: 1 });
    assert.deepEqual(await lotRow(unsold.id), { hammer_price: null, winner_user_id: null });
  });

  it('notifies each bidder once even if they bid several times', async () => {
    const ann = await createUser();
    const bob = await createUser();
    const auction = await createAuction();
    const lot = await createLot({ auction_id: auction.id });
    await createBid(lot.id, ann.id, 10);
    await createBid(lot.id, bob.id, 20);
    await createBid(lot.id, ann.id, 30);
    await closeAuction(auction.id);
    assert.equal((await notificationsFor(ann.id)).length, 1);
    assert.equal((await notificationsFor(bob.id)).length, 1);
  });

  it('records the real close time when closing early', async () => {
    const auction = await createAuction({ closes_at: new Date(Date.now() + 5 * HOUR) });
    await closeAuction(auction.id);
    const [row] = await rows('SELECT closes_at FROM auctions WHERE id = $1', [auction.id]);
    assert.ok(new Date(row.closes_at) <= new Date(Date.now() + 1000));
  });

  it('keeps the scheduled close time when closing after it', async () => {
    const auction = await createAuction({ starts_at: new Date(Date.now() - 2 * HOUR), closes_at: new Date(Date.now() - HOUR) });
    await closeAuction(auction.id);
    const [row] = await rows('SELECT closes_at FROM auctions WHERE id = $1', [auction.id]);
    assert.equal(new Date(row.closes_at).getTime(), new Date(auction.closes_at).getTime());
  });

  it('does nothing for upcoming, closed or unknown auctions', async () => {
    const ann = await createUser();
    for (const status of ['upcoming', 'closed']) {
      const auction = await createAuction({ status });
      const lot = await createLot({ auction_id: auction.id });
      await createBid(lot.id, ann.id, 10);
      assert.deepEqual(await closeAuction(auction.id), { closed: false });
      assert.deepEqual(await lotRow(lot.id), { hammer_price: null, winner_user_id: null });
    }
    assert.deepEqual(await closeAuction(999999), { closed: false });
  });
});
