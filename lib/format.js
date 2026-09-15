const { formatCentral } = require('./time');

function formatMoney(amount, currency) {
  if (amount == null) return '';
  return `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim();
}

function money(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(amount));
}

function userPath(userId, suffix) {
  return userId ? `/u/${userId}${suffix}` : suffix;
}

module.exports = { formatCentral, formatMoney, money, userPath };
