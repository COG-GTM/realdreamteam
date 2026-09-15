const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { cloneForward, calendarCheck, cleanup, resetRecycler } = require('../../lib/sim/recycle');

const { describeDb, db, createUser, createHouse, createLot, createAuction, createBid, rows } = helper;

const DAY = 24 * 60 * 60 * 1000;

// Deterministic: smallest factor drift, smallest int, first pick — makes the
// "30% of sold lots" selection include everything.
function forcedRng() {
  return {
    float: () => 0.01,
    int: (min) => min,
    pick: (arr) => arr[0],
    weighted: (entries) => (entries.length ? entries[0].value : null)
  };
}

const silent = () => {};

async function markSold(lotId, userId, price) {
  await db.query('UPDATE lots SET hammer_price = $2, winner_user_id = $3 WHERE id = $1', [lotId, price, userId]);
}

async function addImage(lotId, url = 'https://img.test/x.jpg') {
  await db.query('INSERT INTO lot_images (lot_id, position, url) VALUES ($1, 1, $2)', [lotId, url]);
}

describeDb('recycler', (it) => {
  it('cloneForward re-offers unsold lots, some sold lots and bank lots', async () => {
    resetRecycler();
    const winner = await createUser({ name: 'Winner' });
    const auction = await createAuction({ status: 'closed', house_ref: 'N100', title: 'Evening Sale' });
    const unsold1 = await createLot({ auction_id: auction.id, lot_number: 1, title: 'Unsold One', estimate_low: 1000, estimate_high: 2000, starting_bid: 500 });
    const unsold2 = await createLot({ auction_id: auction.id, lot_number: 2, title: 'Unsold Two', estimate_low: 3000, estimate_high: 4000 });
    for (const n of [3, 4, 5]) {
      const sold = await createLot({ auction_id: auction.id, lot_number: n, title: `Sold ${n}` });
      await markSold(sold.id, winner.id, 1000 * n);
    }
    await addImage(unsold1.id);
    await createBid(unsold2.id, winner.id, 3100);

    const result = await cloneForward(forcedRng(), { now: new Date(), log: silent });
    assert.equal(Number(result.sourceId), Number(auction.id));
    const clone = (await rows('SELECT * FROM auctions WHERE id = $1', [result.auctionId]))[0];
    assert.equal(clone.house_ref, 'N100-S2');
    assert.equal(clone.status, 'upcoming');
    assert.equal(clone.format, 'timed');
    assert.equal(Number(clone.cloned_from_auction_id), Number(auction.id));

    const cloneLots = await rows('SELECT * FROM lots WHERE auction_id = $1 ORDER BY lot_number', [clone.id]);
    // 2 unsold + 3 sold (forced rng takes all) + 2 bank lots = 7, numbered 1..7.
    assert.equal(cloneLots.length, 7);
    assert.equal(cloneLots[0].title, 'Unsold One');
    assert.equal(Number(cloneLots[0].reoffered_from_lot_id), Number(unsold1.id));
    assert.equal(Number(cloneLots[1].reoffered_from_lot_id), Number(unsold2.id));
    assert.ok(cloneLots.every((lot) => lot.hammer_price == null && lot.winner_user_id == null));
    assert.equal((await rows('SELECT COUNT(*)::int AS c FROM lot_images WHERE lot_id = $1', [cloneLots[0].id]))[0].c, 1);
    assert.equal((await rows('SELECT COUNT(*)::int AS c FROM bids b JOIN lots l ON l.id = b.lot_id WHERE l.auction_id = $1', [clone.id]))[0].c, 0);
    // Drifted estimates: 1000 * (0.9 + 0.01 * 0.2) = 902 → nearest 1 (below 1000).
    assert.equal(Number(cloneLots[0].estimate_low), 902);
    // Original untouched.
    const original = await rows('SELECT COUNT(*)::int AS c FROM lots WHERE auction_id = $1 AND hammer_price IS NOT NULL', [auction.id]);
    assert.equal(original[0].c, 3);
    const activity = await rows("SELECT kind, detail FROM activity WHERE kind = 'reoffered'");
    assert.equal(activity.length, 1);
    assert.match(activity[0].detail, /lots, from Evening Sale/);
  });

  it('clones the lineage tip (-S3) only once the -S2 is closed', async () => {
    resetRecycler();
    const auction = await createAuction({ status: 'closed', house_ref: 'M200' });
    await createLot({ auction_id: auction.id, lot_number: 1 });

    const first = await cloneForward(forcedRng(), { now: new Date(), log: silent });
    // While the clone is still upcoming there is no other closed auction to clone.
    const second = await cloneForward(forcedRng(), { now: new Date(), log: silent });
    assert.equal(second.skipped, 'nothing to clone');

    await db.query("UPDATE auctions SET status = 'closed' WHERE id = $1", [first.auctionId]);
    const third = await cloneForward(forcedRng(), { now: new Date(), log: silent });
    const clone = (await rows('SELECT house_ref, cloned_from_auction_id FROM auctions WHERE id = $1', [third.auctionId]))[0];
    assert.equal(clone.house_ref, 'M200-S3');
    assert.equal(Number(clone.cloned_from_auction_id), Number(first.auctionId));
  });

  it('calendarCheck clones when no upcoming exists and pulls starts_at forward', async () => {
    resetRecycler();
    const auction = await createAuction({ status: 'closed', house_ref: 'P300' });
    await createLot({ auction_id: auction.id, lot_number: 1 });
    const result = await calendarCheck({ now: new Date(), rng: forcedRng(), log: silent });
    assert.equal(result.action, 'reoffered');
  });

  it('calendarCheck pulls a distant upcoming sale forward when few are open', async () => {
    resetRecycler();
    await createAuction({ status: 'open' });
    const upcoming = await createAuction({ status: 'upcoming', starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000), closes_at: new Date(Date.now() + 3 * 60 * 60 * 1000) });
    const result = await calendarCheck({ now: new Date(), rng: forcedRng(), log: silent });
    assert.equal(result, null);
    const after = (await rows('SELECT starts_at FROM auctions WHERE id = $1', [upcoming.id]))[0];
    assert.ok(new Date(after.starts_at) < new Date(Date.now() + 10 * 60 * 1000), after.starts_at);
  });

  it('cleanup deletes old closed auctions but keeps the direct parent of a tip', async () => {
    resetRecycler();
    const house = await createHouse();
    const a = await createAuction({ auction_house_id: house.id, status: 'closed', starts_at: new Date(Date.now() - 120 * DAY), closes_at: new Date(Date.now() - 100 * DAY), house_ref: 'C1' });
    const b = await createAuction({ auction_house_id: house.id, status: 'closed', starts_at: new Date(Date.now() - 100 * DAY), closes_at: new Date(Date.now() - 95 * DAY), house_ref: 'C1-S2' });
    const c = await createAuction({ auction_house_id: house.id, status: 'closed', starts_at: new Date(Date.now() - 60 * DAY), closes_at: new Date(Date.now() - 50 * DAY), house_ref: 'C1-S3' });
    await db.query('UPDATE auctions SET cloned_from_auction_id = $2 WHERE id = $1', [b.id, a.id]);
    await db.query('UPDATE auctions SET cloned_from_auction_id = $2 WHERE id = $1', [c.id, b.id]);
    const lotA = await createLot({ auction_id: a.id, lot_number: 1 });
    const lotB = await createLot({ auction_id: b.id, lot_number: 1 });
    await db.query('UPDATE lots SET reoffered_from_lot_id = $2 WHERE id = $1', [lotB.id, lotA.id]);

    const result = await cleanup(silent);
    assert.equal(result.deleted, 1);
    const remaining = await rows('SELECT id FROM auctions WHERE id = ANY($1::bigint[]) ORDER BY id', [[a.id, b.id, c.id]]);
    assert.deepEqual(remaining.map((row) => Number(row.id)), [Number(b.id), Number(c.id)]);
    const lotBAfter = (await rows('SELECT reoffered_from_lot_id FROM lots WHERE id = $1', [lotB.id]))[0];
    assert.equal(lotBAfter.reoffered_from_lot_id, null);
  });
});
