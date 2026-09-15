// Adding a lot from the admin page: validate the form, insert the lot and its
// image, and create a new_lot notification for every user whose preferences
// match.
const { withTransaction } = require('../db/db');
const { isCategory, categories } = require('./categories');
const { matchReasons } = require('./matching');

function text(value) {
  return String(value ?? '').trim();
}

// Optional whole number: '' -> null, '12' -> 12, anything else -> NaN.
function optionalInteger(value) {
  const raw = text(value);
  if (!raw) return null;
  return /^-?\d+$/.test(raw) ? Number(raw) : NaN;
}

// Returns { lot } with clean values ready for SQL, or { errors: [...] }.
function validateLot(fields = {}) {
  const errors = [];
  const lot = {
    auction_id: optionalInteger(fields.auction_id),
    lot_number: optionalInteger(fields.lot_number),
    title: text(fields.title),
    artist: text(fields.artist) || null,
    category: categories.find((c) => c.toLowerCase() === text(fields.category).toLowerCase()) || text(fields.category),
    description: text(fields.description) || null,
    currency: (text(fields.currency) || 'USD').toUpperCase(),
    estimate_low: optionalInteger(fields.estimate_low),
    estimate_high: optionalInteger(fields.estimate_high),
    starting_bid: optionalInteger(fields.starting_bid),
    source_url: text(fields.source_url) || null,
    image_url: text(fields.image_url) || null,
    image_credit: text(fields.image_credit) || null
  };

  if (!lot.auction_id) errors.push('Choose an auction.');
  if (!lot.title) errors.push('Title is required.');
  if (!isCategory(lot.category)) errors.push('Choose a category from the list.');
  if (!/^[A-Z]{3}$/.test(lot.currency)) errors.push('Currency must be a 3-letter code like USD.');
  for (const name of ['lot_number', 'estimate_low', 'estimate_high', 'starting_bid']) {
    if (Number.isNaN(lot[name])) errors.push(`${name.replace('_', ' ')} must be a whole number.`);
    else if (lot[name] !== null && lot[name] < 0) errors.push(`${name.replace('_', ' ')} cannot be negative.`);
  }
  if (lot.estimate_low !== null && lot.estimate_high !== null && lot.estimate_low > lot.estimate_high) {
    errors.push('Low estimate must not be above the high estimate.');
  }
  return errors.length ? { errors } : { lot };
}

// Inserts the lot and returns { lot, notified } where notified is the number
// of users who received a new_lot notification.
async function createLot(fields) {
  const checked = validateLot(fields);
  if (checked.errors) {
    const error = new Error(checked.errors.join(' '));
    error.status = 400;
    throw error;
  }
  const values = checked.lot;

  const result = await withTransaction(async (client) => {
    const auction = (await client.query(
      'SELECT id, title, location, starts_at, status FROM auctions WHERE id = $1',
      [values.auction_id]
    )).rows[0];
    if (!auction) throw Object.assign(new Error('That auction does not exist.'), { status: 400 });
    if (auction.status === 'closed') throw Object.assign(new Error('That auction is closed.'), { status: 400 });

    const lot = (await client.query(
      `INSERT INTO lots
       (auction_id, lot_number, title, artist, category, description, currency,
        estimate_low, estimate_high, starting_bid, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        values.auction_id, values.lot_number, values.title, values.artist, values.category,
        values.description, values.currency, values.estimate_low, values.estimate_high,
        values.starting_bid, values.source_url
      ]
    )).rows[0];

    if (values.image_url) {
      await client.query(
        'INSERT INTO lot_images (lot_id, position, url, credit) VALUES ($1, 1, $2, $3)',
        [lot.id, values.image_url, values.image_credit]
      );
    }

    const users = (await client.query(
      `SELECT u.id, u.name, p.categories, p.artists, p.keywords
       FROM users u JOIN preferences p ON p.user_id = u.id
       WHERE u.banned = false`
    )).rows;
    const matched = [];
    for (const user of users) {
      const reasons = matchReasons(lot, user);
      if (reasons.length === 0) continue;
      await client.query(
        `INSERT INTO notifications (user_id, lot_id, kind, reason)
         VALUES ($1, $2, 'new_lot', $3) ON CONFLICT DO NOTHING`,
        [user.id, lot.id, reasons.join(', ')]
      );
      matched.push(user.name);
    }
    return { lot, auction, matched };
  });

  return { lot: result.lot, notified: result.matched.length };
}

module.exports = { createLot, validateLot };
