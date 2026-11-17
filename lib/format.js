const { formatCentral } = require('./time');

// Building an Intl.NumberFormat is far costlier than using one, and lot grids
// format several amounts per card, so formatters are built once and reused.
const plainFormats = {
  0: new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  2: new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
};
const currencyFormats = new Map();

function currencyFormat(currency, fractionDigits) {
  const key = `${currency}:${fractionDigits}`;
  let format = currencyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2
    });
    currencyFormats.set(key, format);
  }
  return format;
}

function formatMoney(amount, currency) {
  if (amount == null) return '';
  const value = Number(amount);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return `${currency || ''} ${plainFormats[fractionDigits].format(value)}`.trim();
}

function money(amount, currency = 'USD') {
  const value = Number(amount);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return currencyFormat(currency, fractionDigits).format(value);
}

function userPath(userId, suffix) {
  return userId ? `/u/${userId}${suffix}` : suffix;
}

module.exports = { formatCentral, formatMoney, money, userPath };
