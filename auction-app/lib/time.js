// Formats a Date (or ISO string) as "2026-09-15 06:43 UTC". Empty string for null.
function formatUtc(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

module.exports = { formatUtc };
