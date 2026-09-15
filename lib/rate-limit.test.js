const test = require('node:test');
const assert = require('node:assert/strict');
const { gateLimiter } = require('./rate-limit');

function request(ip) {
  return { ip, rateLimited: false };
}

function check(limiter, req) {
  limiter(req, {}, () => {});
  return req.rateLimited;
}

test('gateLimiter flags the attempt after the maximum failures', () => {
  let clock = 0;
  const limiter = gateLimiter({ max: 10, windowMs: 100, now: () => clock });
  const req = request('127.0.0.1');

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(check(limiter, req), false);
    limiter.recordFailure(req);
  }
  assert.equal(check(limiter, req), true);
  assert.equal(check(limiter, request('127.0.0.2')), false);

  clock = 100;
  assert.equal(check(limiter, req), false);
});

test('gateLimiter uses the defaults of 10 attempts per 15 minutes', () => {
  let clock = 0;
  const limiter = gateLimiter({ now: () => clock });
  const req = request('10.0.0.1');
  for (let attempt = 0; attempt < 10; attempt += 1) limiter.recordFailure(req);
  assert.equal(check(limiter, req), true);
  clock = 15 * 60 * 1000 - 1;
  assert.equal(check(limiter, req), true);
  clock = 15 * 60 * 1000;
  assert.equal(check(limiter, req), false);
});

test('gateLimiter starts a fresh window after the old one expires', () => {
  let clock = 0;
  const limiter = gateLimiter({ max: 2, windowMs: 100, now: () => clock });
  const req = request('10.0.0.2');
  limiter.recordFailure(req);
  limiter.recordFailure(req);
  assert.equal(check(limiter, req), true);
  clock = 150;
  limiter.recordFailure(req);
  assert.equal(check(limiter, req), false, 'one failure in the new window is under the limit');
  limiter.recordFailure(req);
  assert.equal(check(limiter, req), true);
});

test('gateLimiter never flags an address that has not failed', () => {
  const limiter = gateLimiter({ max: 1, windowMs: 100, now: () => 0 });
  assert.equal(check(limiter, request('10.0.0.3')), false);
  assert.equal(check(limiter, request(undefined)), false);
});
