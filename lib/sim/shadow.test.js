const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRng } = require('./rng');
const { chooseBidAmount, weightForLot, fairness, chooseAction } = require('./shadow');
const { nextBid, maxBid } = require('../bids');

const HOUR = 60 * 60 * 1000;

test.describe('chooseBidAmount', () => {
  const persona = { budget: 2, aggression: 0.5, sniper: false, activity: 1 };
  const info = { highBid: 100, startingBid: 50, estimateLow: 80, estimateHigh: 1000, persona };

  test.it('returns null when there is no anchor', () => {
    assert.equal(chooseBidAmount({ persona }, makeRng(1)), null);
  });

  test.it('splits roughly 70/25/5 between min, +increment and jump', () => {
    const rng = makeRng(5);
    const min = nextBid(info);
    const max = maxBid(info);
    const counts = { min: 0, step: 0, jump: 0 };
    for (let i = 0; i < 1000; i += 1) {
      const amount = chooseBidAmount(info, rng);
      if (amount === min) counts.min += 1;
      else if (amount === min + 10) counts.step += 1;
      else counts.jump += 1;
      assert.ok(amount <= max, amount);
    }
    assert.ok(counts.min > 600 && counts.min < 780, counts);
    assert.ok(counts.step > 170 && counts.step < 330, counts);
    assert.ok(counts.jump < 100, counts);
  });

  test.it('refuses to bid above estimate_high × budget', () => {
    const rng = makeRng(2);
    const capped = { highBid: 100, estimateHigh: 105, persona: { budget: 1 } };
    assert.equal(chooseBidAmount(capped, rng), null);
    const roomy = { highBid: 100, estimateHigh: 200, persona: { budget: 2 } };
    assert.equal(chooseBidAmount(roomy, rng), 110);
  });
});

test.describe('weightForLot', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  const base = { id: 1, title: 'Untitled', artist: null, category: 'Misc', description: null, bid_count: 3, bids_last_hour: 0, max_bids_last_hour: 0 };
  const ctx = { persona: { sniper: false }, preferences: {}, humanTargetLotIds: new Set(), now };

  test.it('is 0 when nothing makes the lot interesting', () => {
    assert.equal(weightForLot(base, ctx, makeRng(1)), 0);
  });

  test.it('sums the §6.3 weights', () => {
    const lot = { ...base, category: 'Contemporary Art', bid_count: 0, bids_last_hour: 2, max_bids_last_hour: 2, closes_at: new Date(now.getTime() + HOUR) };
    const c = { ...ctx, preferences: { categories: ['Contemporary Art'] }, humanTargetLotIds: new Set([1]) };
    // 35 (human target) + 25 (preference) + 20 (closes < 2 h) + 15 (hottest) + 5 (no bids) = 100, no closes multiplier (no starts_at).
    assert.equal(weightForLot(lot, c, makeRng(1)), 100);
  });

  test.it('applies the ending-soon multiplier', () => {
    const startsAt = new Date(now.getTime() - 9 * 24 * HOUR);
    const closesAt = new Date(now.getTime() + 24 * HOUR); // 90% elapsed
    const lot = { ...base, category: 'Contemporary Art', starts_at: startsAt, closes_at: closesAt };
    const c = { ...ctx, preferences: { categories: ['Contemporary Art'] } };
    const expected = 25 * (1 + 3 * 0.9 * 0.9);
    assert.ok(Math.abs(weightForLot(lot, c, makeRng(1)) - expected) < 1e-9);
  });

  test.it('gates snipers to the last 10% and never to timeless auctions', () => {
    const persona = { sniper: true };
    const prefs = { categories: ['Contemporary Art'] };
    const mid = { ...base, category: 'Contemporary Art', starts_at: new Date(now.getTime() - 5 * 24 * HOUR), closes_at: new Date(now.getTime() + 5 * 24 * HOUR) };
    assert.equal(weightForLot(mid, { ...ctx, persona, preferences: prefs }, makeRng(1)), 0);
    const late = { ...mid, closes_at: new Date(now.getTime() + 0.5 * 24 * HOUR) };
    assert.ok(weightForLot(late, { ...ctx, persona, preferences: prefs }, makeRng(1)) > 0);
    const timeless = { ...base, category: 'Contemporary Art' };
    assert.equal(weightForLot(timeless, { ...ctx, persona, preferences: prefs }, makeRng(1)), 0);
  });
});

test.describe('fairness', () => {
  const now = new Date('2026-09-15T12:00:00Z');

  test.it('blocks outbidding a human in the last 15 minutes', () => {
    assert.equal(fairness({ humanHighBidderId: 5, closesAt: new Date(now.getTime() + 10 * 60 * 1000) }, now), false);
    assert.equal(fairness({ humanHighBidderId: 5, closesAt: new Date(now.getTime() + 30 * 60 * 1000) }, now), true);
  });

  test.it('blocks a second shadow outbid within 10 minutes', () => {
    const recent = now.getTime() - 5 * 60 * 1000;
    const stale = now.getTime() - 20 * 60 * 1000;
    assert.equal(fairness({ humanHighBidderId: 5, closesAt: null, lastShadowOutbidAtForHuman: recent }, now), false);
    assert.equal(fairness({ humanHighBidderId: 5, closesAt: null, lastShadowOutbidAtForHuman: stale }, now), true);
  });

  test.it('always allows lots with no human high bidder', () => {
    assert.equal(fairness({ humanHighBidderId: null, closesAt: new Date(now.getTime() + 1000) }, now), true);
  });
});

test.describe('chooseAction', () => {
  test.it('returns one of the weighted actions, including quiet moments', () => {
    const rng = makeRng(8);
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(chooseAction(rng));
    assert.deepEqual([...seen].sort(), ['bid', 'close_early', 'favorite', 'nothing', 'publish_lot', 'respond_outbid']);
  });
});
