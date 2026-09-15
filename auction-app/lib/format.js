function formatUtc(value) {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function formatMoney(amount, currency) {
  if (amount == null) return '';
  return `${currency || ''} ${Number(amount).toLocaleString('en-GB')}`.trim();
}

function userPath(userId, suffix) {
  return userId ? `/u/${userId}${suffix}` : suffix;
}

module.exports = { formatUtc, formatMoney, userPath };
