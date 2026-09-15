const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { runTick, resetDirector } = require('../../lib/sim/director');
const { placeBid } = require('../../lib/bids');
const presence = require('../../lib/sim/presence');

const { describeDb, db, createUser, createLot, createAuction, createBid, setPreferences, rows, notificationsFor } = helper;

async function makeShadow(name, persona = { budget: 1.5, aggression: 0.8, sniper: false, activity: 1 }) {
  const user = await createUser({ name });
  await db.query('UPDATE users SET shadow = true, persona = $2 WHERE id = $1', [user.id, JSON.stringify(persona)]);
  return user;
}

// rng that deterministically picks the first weighted entry ('bid', first
// shadow, first eligible lot) and the minimum bid amount.
function forcedRng() {
  return {
    float: () => 0.01,
    int: (a) => a,
    pick: (arr) => arr[0],
    weighted: (entries) => (entries.length ? entries[0].value : null)
  };
}

const silent = () => {};

describeDb('sim director', (it) => {
  it('a bid tick outbids the human, writes activity and an outbid notification', async () => {
    presence.reset();
    resetDirector();
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow One');
    await setPreferences(shadow.id, { categories: ['Contemporary Art'] });
    const auction = await createAuction();
    const lot = await createLot({ auction_id: auction.id, starting_bid: 100, estimate_high: 500 });
    await createBid(lot.id, human.id, 120);
    presence.touch(human.id);

    const result = await runTick({ rng: forcedRng(), now: new Date(), presence, log: silent });
    assert.equal(result.action, 'bid');
    assert.equal(result.userName, 'Shadow One');
    assert.equal(Number(result.amount), 130);

    const shadowBids = await rows('SELECT amount FROM bids WHERE lot_id = $1 AND user_id = $2', [lot.id, shadow.id]);
    assert.deepEqual(shadowBids.map((row) => Number(row.amount)), [130]);
    assert.equal((await notificationsFor(human.id)).filter((n) => n.kind === 'outbid').length, 1);
    const activity = await rows("SELECT kind, amount FROM activity WHERE kind = 'bid'");
    assert.equal(activity.length, 1);
  });

  it('fairness blocks a shadow outbid in the last 15 minutes before close', async () => {
    presence.reset();
    resetDirector();
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow Two');
    await setPreferences(shadow.id, { categories: ['Contemporary Art'] });
    const auction = await createAuction({ closes_at: new Date(Date.now() + 10 * 60 * 1000) });
    const lot = await createLot({ auction_id: auction.id, starting_bid: 100 });
    await createBid(lot.id, human.id, 120);
    presence.touch(human.id);

    const result = await runTick({ rng: forcedRng(), now: new Date(), presence, log: silent });
    assert.equal(result.skipped, 'no eligible lot');
    const bids = await rows('SELECT COUNT(*)::int AS count FROM bids WHERE lot_id = $1', [lot.id]);
    assert.equal(bids[0].count, 1);
    assert.equal((await notificationsFor(human.id)).length, 0);
  });

  it('favorites still apply to lots fairness blocks for bids', async () => {
    presence.reset();
    resetDirector();
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow Fav');
    await setPreferences(shadow.id, { categories: ['Contemporary Art'] });
    const auction = await createAuction({ closes_at: new Date(Date.now() + 5 * 60 * 1000) });
    const lot = await createLot({ auction_id: auction.id, starting_bid: 100 });
    await createBid(lot.id, human.id, 120);
    presence.touch(human.id);

    const favoriteRng = {
      ...forcedRng(),
      weighted: (entries) => {
        const favorite = entries.find((entry) => entry.value === 'favorite');
        return favorite ? favorite.value : (entries.length ? entries[0].value : null);
      }
    };

    // A bid tick is blocked by fairness (closes within 15 min)…
    const bidResult = await runTick({ rng: forcedRng(), now: new Date(), presence, log: silent });
    assert.equal(bidResult.skipped, 'no eligible lot');

    // …but a favorite tick still picks the same lot.
    const favResult = await runTick({ rng: favoriteRng, now: new Date(), presence, log: silent });
    assert.equal(favResult.action, 'favorite');
    assert.equal(Number(favResult.lotId), Number(lot.id));
    const favorites = await rows('SELECT COUNT(*)::int AS count FROM favorites WHERE lot_id = $1 AND user_id = $2', [lot.id, shadow.id]);
    assert.equal(favorites[0].count, 1);
  });

  it('a human outbidding a shadow produces no notification for the shadow', async () => {
    presence.reset();
    resetDirector();
    const human = await createUser({ name: 'Human' });
    const shadow = await makeShadow('Shadow Three');
    const lot = await createLot({ starting_bid: 100 });
    await createBid(lot.id, shadow.id, 120);

    assert.equal((await placeBid({ userId: human.id, lotId: lot.id, amount: '140' })).ok, true);
    assert.equal((await notificationsFor(shadow.id)).length, 0);
  });
});
