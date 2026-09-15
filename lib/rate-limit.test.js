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
