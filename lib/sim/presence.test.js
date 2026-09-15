const test = require('node:test');
const assert = require('node:assert/strict');
const presence = require('./presence');

test.describe('presence', () => {
  test.it('reports nobody until someone touches, then expires after the idle window', () => {
    presence.reset();
    const t0 = 1_000_000;
    assert.equal(presence.anyoneActive(90_000, t0), false);
    presence.touch(7, t0);
    assert.equal(presence.anyoneActive(90_000, t0 + 10_000), true);
    assert.equal(presence.anyoneActive(90_000, t0 + 100_000), false);
  });

  test.it('activeHumanIds returns real users and excludes anon', () => {
    presence.reset();
    const t0 = 2_000_000;
    presence.touch(null, t0);
    presence.touch('', t0);
    presence.touch('42', t0);
    presence.touch(7, t0);
    assert.deepEqual(presence.activeHumanIds(90_000, t0 + 1000).sort((a, b) => a - b), [7, 42]);
    assert.deepEqual(presence.activeHumanIds(90_000, t0 + 200_000), []);
  });

  test.it('forceAwakeUntil keeps anyoneActive true with no heartbeat', () => {
    presence.reset();
    const t0 = 3_000_000;
    presence.forceAwakeUntil(t0 + 10 * 60 * 1000);
    assert.equal(presence.anyoneActive(90_000, t0 + 60_000), true);
    assert.equal(presence.anyoneActive(90_000, t0 + 11 * 60 * 1000), false);
    presence.reset();
    assert.equal(presence.awakeUntil(), 0);
  });
});
