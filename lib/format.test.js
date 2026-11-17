const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMoney, money, userPath } = require('./format');

test('formatMoney prefixes the currency and groups thousands', () => {
  assert.equal(formatMoney(55000, 'GBP'), 'GBP 55,000');
  assert.equal(formatMoney('1234567', 'USD'), 'USD 1,234,567');
  assert.equal(formatMoney(1250.5, 'USD'), 'USD 1,250.50');
});

test('formatMoney handles missing amount or currency', () => {
  assert.equal(formatMoney(null, 'GBP'), '');
  assert.equal(formatMoney(undefined, 'GBP'), '');
  assert.equal(formatMoney(500, null), '500');
});

test('money renders a currency symbol with cents when present', () => {
  assert.equal(money(55000, 'GBP'), '£55,000');
  assert.equal(money(1200.6, 'USD'), '$1,200.60');
  assert.equal(money(1200.05, 'USD'), '$1,200.05');
  assert.equal(money('300'), '$300');
  assert.equal(money(0, 'EUR'), '€0');
});

test('userPath scopes a path under /u/:id only when a user is known', () => {
  assert.equal(userPath(7, '/lots/3'), '/u/7/lots/3');
  assert.equal(userPath('7', '/summary'), '/u/7/summary');
  assert.equal(userPath('', '/lots/3'), '/lots/3');
  assert.equal(userPath(null, '/auctions'), '/auctions');
});

test('formatMoney and money match freshly built formatters across reused calls', () => {
  const amounts = [0, 1, 12.5, 999.99, 1000, 1234.5, 55000, 1234567.891, '300', '1250.50', -42.1];
  for (const currency of ['GBP', 'USD', 'EUR', 'CHF']) {
    for (const amount of amounts) {
      const value = Number(amount);
      const digits = Number.isInteger(value) ? 0 : 2;
      const plain = value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
      const symbol = new Intl.NumberFormat('en-US', {
        style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: 2
      }).format(value);
      assert.equal(formatMoney(amount, currency), `${currency} ${plain}`);
      assert.equal(money(amount, currency), symbol);
    }
  }
});
