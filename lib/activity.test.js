const test = require('node:test');
const assert = require('node:assert/strict');
const { describeActivity, relativeTime } = require('./activity');

test.describe('describeActivity', () => {
  test.it('describes a bid with the lot currency', () => {
    const row = { kind: 'bid', actor_name: 'Priya Raman', lot_title: 'Untitled (Skull)', amount: '6250.00', lot_currency: 'GBP' };
    assert.equal(describeActivity(row), 'Priya Raman bid £6,250 on Untitled (Skull)');
  });

  test.it('describes a favorite, a new lot and an opened auction', () => {
    assert.equal(
      describeActivity({ kind: 'favorite', actor_name: 'Marcus Thompson', lot_title: 'Rabbit' }),
      'Marcus Thompson favorited Rabbit'
    );
    assert.equal(
      describeActivity({ kind: 'new_lot', lot_title: 'Rabbit', auction_title: 'Evening Sale' }),
      'New lot in Evening Sale: Rabbit'
    );
    assert.equal(
      describeActivity({ kind: 'opened', house_name: "Sotheby's", auction_title: 'Contemporary Evening Sale' }),
      "Sotheby's opened Contemporary Evening Sale"
    );
    assert.equal(
      describeActivity({ kind: 'closed', house_name: "Christie's", auction_title: 'Day Sale' }),
      "Christie's closed Day Sale"
    );
  });

  test.it('describes a sale as SOLD — lot to winner for hammer', () => {
    const row = { kind: 'sold', actor_name: 'Marcus T.', lot_title: 'Vintage Rolex', amount: '8400.00', lot_currency: 'USD' };
    assert.equal(describeActivity(row), 'SOLD — Vintage Rolex to Marcus T. for $8,400');
  });

  test.it('re-offers and unknown kinds fall back gracefully', () => {
    assert.equal(
      describeActivity({ kind: 'reoffered', lot_title: 'Rabbit', auction_title: 'Season 2' }),
      'Rabbit re-offered in Season 2'
    );
    assert.equal(describeActivity({ kind: 'other', detail: 'something' }), 'something');
    assert.equal(describeActivity({ kind: 'other' }), 'other');
  });
});

test.describe('relativeTime', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  const at = (ms) => new Date(now.getTime() - ms * 1000);

  test.it('formats seconds, minutes, hours and days', () => {
    assert.equal(relativeTime(at(12), now), '12 s ago');
    assert.equal(relativeTime(at(90), now), '1 min ago');
    assert.equal(relativeTime(at(3600), now), '1 h ago');
    assert.equal(relativeTime(at(3 * 86400), now), '3 d ago');
  });

  test.it('never goes negative for clock skew', () => {
    assert.equal(relativeTime(at(-5), now), '0 s ago');
  });
});
