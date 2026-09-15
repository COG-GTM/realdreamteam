const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { placeBid } = require('../../lib/bids');
const { closeAuction } = require('../../lib/close');
const { createLot } = require('../../lib/new-lot');

const { describeDb, createUser, createLot: makeLot, createAuction, createBid, rows, notificationsFor } = helper;

async function makeShadow(name) {
  const user = await createUser({ name });
  await helper.db.query('UPDATE users SET shadow = true WHERE id = $1', [user.id]);
  return user;
}

describeDb('activity log', (it) => {
  it('placeBid writes a bid row with an outbid detail', async () => {
    const ann = await createUser({ name: 'Ann' });
    const bob = await createUser({ name: 'Bob' });
    const lot = await makeLot({ title: 'Blue Canvas', starting_bid: 100 });

    const first = await placeBid({ userId: ann.id, lotId: lot.id, amount: '120' });
    assert.equal(first.ok, true);
    const second = await placeBid({ userId: bob.id, lotId: lot.id, amount: '140' });
    assert.equal(second.ok, true);

    const activity = await rows('SELECT * FROM activity ORDER BY id');
    assert.equal(activity.length, 2);
    assert.deepEqual(
      activity.map((row) => [row.kind, row.actor_user_id != null, row.lot_id != null, row.auction_id != null, Number(row.amount), row.detail]),
      [['bid', true, true, true, 120, null], ['bid', true, true, true, 140, 'outbid Ann']]
    );
  });

  it('closeAuction writes a closed row plus a sold row per sold lot', async () => {
    const ann = await createUser({ name: 'Ann' });
    const auction = await createAuction();
    const sold = await makeLot({ auction_id: auction.id, starting_bid: 100 });
    await makeLot({ auction_id: auction.id, lot_number: 2, title: 'No bids', starting_bid: 100 });
    await createBid(sold.id, ann.id, 150);

    assert.equal((await closeAuction(auction.id)).closed, true);

    const activity = await rows('SELECT kind, lot_id, amount FROM activity ORDER BY id');
    assert.deepEqual(
      activity.map((row) => [row.kind, row.lot_id != null, row.amount == null ? null : Number(row.amount)]),
      [['sold', true, 150], ['closed', false, null]]
    );
  });

  it('a shadow bidder gets no outbid notification while a normal user does', async () => {
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow One');
    const third = await createUser({ name: 'Third' });
    const lot = await makeLot({ starting_bid: 100 });

    assert.equal((await placeBid({ userId: human.id, lotId: lot.id, amount: '120' })).ok, true);
    assert.equal((await placeBid({ userId: shadow.id, lotId: lot.id, amount: '140' })).ok, true);
    assert.equal((await placeBid({ userId: third.id, lotId: lot.id, amount: '160' })).ok, true);

    // The human was outbid by the shadow: notified. The shadow was outbid by
    // Third: no notification row is written for a shadow recipient.
    assert.equal((await notificationsFor(human.id)).filter((n) => n.kind === 'outbid').length, 1);
    assert.equal((await notificationsFor(shadow.id)).length, 0);
    assert.equal((await notificationsFor(third.id)).length, 0);
  });

  it('closeAuction sends sold notifications only to non-shadow bidders', async () => {
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow Two');
    const auction = await createAuction();
    const lot = await makeLot({ auction_id: auction.id, starting_bid: 100 });
    await createBid(lot.id, shadow.id, 120, new Date(Date.now() - 2000));
    await createBid(lot.id, human.id, 150, new Date(Date.now() - 1000));

    assert.equal((await closeAuction(auction.id)).closed, true);
    assert.equal((await notificationsFor(human.id)).filter((n) => n.kind === 'sold').length, 1);
    assert.equal((await notificationsFor(shadow.id)).length, 0);
  });

  it('createLot writes a new_lot row and does not notify shadow users', async () => {
    const human = await createUser({ name: 'Watcher' });
    const shadow = await makeShadow('Quiet Shadow');
    await helper.setPreferences(human.id, { keywords: ['diamond'] });
    await helper.setPreferences(shadow.id, { keywords: ['diamond'] });
    const auction = await createAuction({ status: 'upcoming' });

    const { lot } = await createLot({
      auction_id: auction.id, lot_number: 1, title: 'diamond brooch',
      category: 'Jewellery', currency: 'USD'
    });

    const activity = await rows("SELECT kind, lot_id, auction_id FROM activity WHERE kind = 'new_lot'");
    assert.deepEqual(activity.map((row) => [row.kind, row.lot_id != null, row.auction_id != null]), [['new_lot', true, true]]);
    assert.equal((await notificationsFor(human.id)).filter((n) => n.kind === 'new_lot').length, 1);
    assert.equal((await notificationsFor(shadow.id)).length, 0);
    assert.ok(lot.id);
  });
});
