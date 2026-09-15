const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRng } = require('./rng');

test.describe('makeRng', () => {
  test.it('is deterministic for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i += 1) assert.equal(a.float(), b.float());
    const c = makeRng(43);
    assert.notEqual(makeRng(42).float(), c.float());
  });

  test.it('float stays in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.float();
      assert.ok(v >= 0 && v < 1, v);
    }
  });

  test.it('int covers the inclusive range', () => {
    const rng = makeRng(9);
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const v = rng.int(1, 4);
      assert.ok(v >= 1 && v <= 4 && Number.isInteger(v));
      seen.add(v);
    }
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  });

  test.it('pick returns array members; weighted respects zero totals', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 20; i += 1) assert.ok([1, 2, 3].includes(rng.pick([1, 2, 3])));
    assert.equal(rng.weighted([{ weight: 0, value: 'a' }]), null);
    assert.equal(rng.weighted([{ weight: 0, value: 'a' }, { weight: 1, value: 'b' }]), 'b');
  });

  test.it('weighted is roughly proportional', () => {
    const rng = makeRng(11);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i += 1) {
      counts[rng.weighted([{ weight: 3, value: 'a' }, { weight: 1, value: 'b' }])] += 1;
    }
    assert.ok(counts.a > counts.b * 2, counts);
  });
});
