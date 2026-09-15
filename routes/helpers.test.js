const test = require('node:test');
const assert = require('node:assert/strict');
const { flashUrl, adminUrl, categoryUrl } = require('./helpers');

test('flashUrl encodes the message and marks errors', () => {
  assert.equal(flashUrl('/u/3/lots/9', 'Bid placed!'), '/u/3/lots/9?flash=Bid%20placed!');
  assert.equal(flashUrl('/u/3/lots/9', 'Too low & slow', true), '/u/3/lots/9?flash=Too%20low%20%26%20slow&error=1');
});

test('adminUrl is bare when there is nothing to carry', () => {
  assert.equal(adminUrl({ body: {}, query: {} }), '/admin');
  assert.equal(adminUrl({ body: {}, query: {} }, { flash: '', error: undefined }), '/admin');
});

test('adminUrl keeps the user from the body or the query', () => {
  assert.equal(adminUrl({ body: { u: '5' }, query: {} }, { flash: 'Saved' }), '/admin?u=5&flash=Saved');
  assert.equal(adminUrl({ body: {}, query: { u: '6' } }, { error: 'Nope' }), '/admin?u=6&error=Nope');
  assert.equal(adminUrl({ body: { u: '5' }, query: { u: '6' } }), '/admin?u=5');
});

test('categoryUrl targets any admin path and encodes values', () => {
  assert.equal(
    categoryUrl({ body: {}, query: { u: '2' } }, '/admin/categories', { flash: 'Added "Wine & Spirits".', new_category: 12 }),
    '/admin/categories?u=2&flash=Added+%22Wine+%26+Spirits%22.&new_category=12'
  );
  assert.equal(categoryUrl({ body: {}, query: {} }, '/admin/categories/3/deactivate'), '/admin/categories/3/deactivate');
});

test('categoryUrl tolerates requests without a parsed body', () => {
  assert.equal(categoryUrl({ query: { u: '1' } }, '/admin/categories'), '/admin/categories?u=1');
});
