const { withTransaction } = require('../db/db');

function validateBid({ amount, highBid, startingBid, status }) {
  if (status !== 'open') {
    return { ok: false, error: 'Bidding is closed for this auction.' };
  }
  const text = String(amount == null ? '' : amount).trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: 'Enter a whole number amount.' };
  }
  const value = Number(text);
  if (value <= 0) {
    return { ok: false, error: 'Enter a whole number amount.' };
  }
  if (typeof highBid === 'number') {
    if (value <= highBid) {
      return { ok: false, error: `Your bid must be higher than the current high bid of ${highBid}.` };
    }
  } else if (typeof startingBid === 'number') {
    if (value < startingBid) {
      return { ok: false, error: `Your bid must be at least the starting bid of ${startingBid}.` };
    }
  }
  return { ok: true, amount: value };
}

async function placeBid({ userId, lotId, amount }) {
  return withTransaction(async (client) => {
    const lotResult = await client.query(
      `SELECT l.id, l.title, l.starting_bid, a.status
       FROM lots l JOIN auctions a ON a.id = l.auction_id
       WHERE l.id = $1 FOR UPDATE OF l`,
      [lotId]
    );
    const lot = lotResult.rows[0];
    if (!lot) return { ok: false, error: 'Lot not found.' };

    const bidderResult = await client.query(
      'SELECT id, name, banned FROM users WHERE id = $1',
      [userId]
    );
    const bidder = bidderResult.rows[0];
    if (!bidder || bidder.banned) {
      return { ok: false, error: 'You are not allowed to bid.' };
    }

    const highResult = await client.query(
      `SELECT user_id, amount FROM bids
       WHERE lot_id = $1 ORDER BY amount DESC, placed_at DESC, id DESC LIMIT 1`,
      [lotId]
    );
    const high = highResult.rows[0] || null;

    const check = validateBid({
      amount,
      highBid: high ? high.amount : null,
      startingBid: lot.starting_bid,
      status: lot.status
    });
    if (!check.ok) return check;

    await client.query(
      'INSERT INTO bids (lot_id, user_id, amount) VALUES ($1, $2, $3)',
      [lotId, userId, check.amount]
    );

    if (high && Number(high.user_id) !== Number(userId)) {
      await client.query(
        `INSERT INTO notifications (user_id, lot_id, kind, reason)
         VALUES ($1, $2, 'outbid', $3)
         ON CONFLICT (user_id, lot_id, kind)
         DO UPDATE SET reason = EXCLUDED.reason, created_at = now(), read_at = NULL`,
        [high.user_id, lotId, `${bidder.name} bid ${check.amount} on "${lot.title}"`]
      );
    }

    return { ok: true };
  });
}

module.exports = { validateBid, placeBid };
