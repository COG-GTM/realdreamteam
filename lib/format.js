const { formatCentral } = require('./time');

function formatMoney(amount, currency) {
  if (amount == null) return '';
  const value = Number(amount);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return `${currency || ''} ${value.toLocaleString('en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  })}`.trim();
}

function money(amount, currency = 'USD') {
  const value = Number(amount);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  }).format(value);
}

function userPath(userId, suffix) {
  return userId ? `/u/${userId}${suffix}` : suffix;
}

module.exports = { formatCentral, formatMoney, money, userPath };
