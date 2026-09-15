const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./poller');

test('start schedules the poller from POLL_SECONDS and does not keep the process alive', (t) => {
  const previous = process.env.POLL_SECONDS;
  process.env.POLL_SECONDS = '7';
  const intervals = [];
  t.mock.method(global, 'setInterval', (fn, ms) => {
    intervals.push(ms);
    return { unref() { this.unrefed = true; } };
  });
  try {
    const timer = start();
    assert.deepEqual(intervals, [7000]);
    assert.equal(timer.unrefed, true);
  } finally {
    if (previous === undefined) delete process.env.POLL_SECONDS;
    else process.env.POLL_SECONDS = previous;
  }
});

test('start defaults to five seconds', (t) => {
  const previous = process.env.POLL_SECONDS;
  delete process.env.POLL_SECONDS;
  const intervals = [];
  t.mock.method(global, 'setInterval', (fn, ms) => { intervals.push(ms); return { unref() {} }; });
  try {
    start();
    assert.deepEqual(intervals, [5000]);
  } finally {
    if (previous !== undefined) process.env.POLL_SECONDS = previous;
  }
});
