// US Central (America/Chicago) time helpers: display, form input and parsing.

const centralFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short'
});

const centralNumeric = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function partsFor(format, date) {
  const parts = {};
  for (const part of format.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return parts;
}

// Formats a Date (or ISO string) as "15 Sep 2026, 10:00 CDT". Empty string for null.
function formatCentral(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = partsFor(centralFormat, date);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

// "2026-09-15T10:00" Central wall-clock for a datetime-local input.
function toCentralInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = partsFor(centralNumeric, date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

// Parses "YYYY-MM-DDTHH:mm(:ss)" as Central wall-clock -> Date (UTC instant).
// Guesses UTC, then shifts by the wall-clock error measured in Chicago; a
// second pass settles DST edges.
function fromCentralInput(text) {
  const m = INPUT_RE.exec(String(text || '').trim());
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s] = m;
  const targetWall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  let guess = targetWall;
  for (let i = 0; i < 2; i += 1) {
    const p = partsFor(centralNumeric, new Date(guess));
    const wallUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    guess += targetWall - wallUtc;
  }
  return new Date(guess);
}

module.exports = { formatCentral, toCentralInput, fromCentralInput };
