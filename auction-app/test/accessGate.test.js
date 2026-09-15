const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidCode } = require('../lib/accessGate');

test('accepts each default access code', () => {
  for (const code of ['20240312', '03122024', '12032024']) {
    assert.equal(isValidCode(code), true);
  }
});

test('rejects invalid access codes', () => {
  assert.equal(isValidCode('20240313'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(undefined), false);
});

test('supports an override code list', () => {
  assert.equal(isValidCode('custom-code', ['custom-code']), true);
  assert.equal(isValidCode('20240312', ['custom-code']), false);
});
