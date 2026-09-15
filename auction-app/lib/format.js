const { formatUtc } = require('./time');

function formatMoney(amount, currency) {
  if (amount == null) return '';
  return `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim();
}

function userPath(userId, suffix) {
  return userId ? `/u/${userId}${suffix}` : suffix;
}

module.exports = { formatUtc, formatMoney, userPath };
