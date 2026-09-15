const { withTransaction } = require('../db/db');
const { formatMoney } = require('./format');
const { logActivity } = require('./activity');

const INCREMENTS = [
  [1, 0.05], [5, 0.25], [25, 0.50], [100, 1],
  [500, 10], [1000, 25], [2500, 100], [5000, 250], [10000, 500],
  [25000, 1000], [50000, 2500], [100000, 5000], [500000, 10000], [Infinity, 50000]
];

function bidIncrement(current) {
  return INCREMENTS.find(([bound]) => current < bound)[1];
}

function minorUnits(value) {
  return Math.round(Number(value) * 100);
}

function incrementMinor(currentMinor) {
  return minorUnits(bidIncrement(currentMinor / 100));
}

function amountFromMinor(value) {
  return value / 100;
}

function pickAnchor({ highBid, startingBid, estimateLow }) {
  for (const value of [highBid, startingBid, estimateLow]) {
    if (value != null && Number(value) > 0) return Number(value);
  }
  return null;
}

function nextBid({ highBid, startingBid, estimateLow }) {
  const anchor = pickAnchor({ highBid, startingBid, estimateLow });
  if (anchor == null) return null;
  if (highBid == null || Number(highBid) <= 0) return anchor;
  return amountFromMinor(minorUnits(highBid) + incrementMinor(minorUnits(highBid)));
}

function maxBid({ highBid, startingBid, estimateLow }) {
  const anchor = pickAnchor({ highBid, startingBid, estimateLow });
  if (anchor == null) return null;
  const base = minorUnits(anchor);
  const increment = incrementMinor(base);
  const cap = base < 10000
    ? Math.max(2 * base, base + 3 * increment, 1000)
    : Math.max(Math.floor(base * 11 / 10), base + 3 * increment);
  return amountFromMinor(cap);
}

function validateBid({ amount, highBid, startingBid, estimateLow, status, userId, highBidderId }) {
  if (status !== 'open') {
    return { ok: false, error: 'Bidding is closed for this auction.' };
  }
  let text = String(amount == null ? '' : amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text) && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: 'Enter an amount like 1250 or 1250.50.' };
  }
  text = text.replace(/,/g, '');
  const value = Number(text);
  if (value <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' };
  }
  const valueMinor = minorUnits(value);
  if (value > Number.MAX_SAFE_INTEGER || valueMinor > Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: 'That amount is too large.' };
  }
  if (highBidderId != null && userId != null && Number(highBidderId) === Number(userId)) {
    return { ok: false, error: 'You are already the high bidder.' };
  }

  const anchor = pickAnchor({ highBid, startingBid, estimateLow });
  if (anchor == null) {
    if (valueMinor < 100) return { ok: false, error: 'Minimum bid is 1.' };
    return { ok: true, amount: amountFromMinor(valueMinor), rounded: false };
  }

  const anchorMinor = minorUnits(anchor);
  const hasHighBid = highBid != null && Number(highBid) > 0;
  const increment = incrementMinor(hasHighBid ? minorUnits(highBid) : anchorMinor);
  const minMinor = hasHighBid ? minorUnits(highBid) + increment : anchorMinor;
  if (valueMinor < minMinor) {
    return hasHighBid
      ? { ok: false, error: `Your bid must be at least ${fmt(amountFromMinor(minMinor))} (current high bid ${fmt(highBid)} + ${fmt(amountFromMinor(increment))} step).` }
      : { ok: false, error: `Your bid must be at least the starting bid of ${fmt(amountFromMinor(minMinor))}.` };
  }

  const roundedMinor = hasHighBid
    ? minorUnits(highBid) + Math.floor((valueMinor - minorUnits(highBid)) / increment) * increment
    : anchorMinor + Math.floor((valueMinor - anchorMinor) / increment) * increment;
  const cap = maxBid({ highBid, startingBid, estimateLow });
  if (amountFromMinor(roundedMinor) > cap) {
    return { ok: false, error: `Bids can't jump more than that above the current price. Bid up to ${fmt(cap)}.` };
  }
  const rounded = amountFromMinor(roundedMinor);
  return { ok: true, amount: rounded, rounded: roundedMinor !== valueMinor };
}

function fmt(value) {
  return formatMoney(value, '');
}

async function placeBid({ userId, lotId, amount }) {
  return withTransaction(async (client) => {
    const lotResult = await client.query(
      `SELECT l.id, l.title, l.starting_bid, l.estimate_low, l.auction_id, a.status
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
      `SELECT b.user_id, b.amount, u.name, u.shadow FROM bids b
       JOIN users u ON u.id = b.user_id
       WHERE b.lot_id = $1 ORDER BY b.amount DESC, b.placed_at ASC, b.id ASC LIMIT 1`,
      [lotId]
    );
    const high = highResult.rows[0] || null;

    const check = validateBid({
      amount,
      highBid: high ? Number(high.amount) : null,
      startingBid: lot.starting_bid == null ? null : Number(lot.starting_bid),
      estimateLow: lot.estimate_low == null ? null : Number(lot.estimate_low),
      status: lot.status,
      userId,
      highBidderId: high ? high.user_id : null
    });
    if (!check.ok) return check;

    await client.query(
      'INSERT INTO bids (lot_id, user_id, amount) VALUES ($1, $2, $3)',
      [lotId, userId, check.amount]
    );

    await logActivity(client, {
      kind: 'bid',
      actorUserId: userId,
      lotId,
      auctionId: lot.auction_id,
      amount: check.amount,
      detail: high && Number(high.user_id) !== Number(userId) ? `outbid ${high.name}` : null
    });

    if (high && Number(high.user_id) !== Number(userId) && !high.shadow) {
      await client.query(
        `INSERT INTO notifications (user_id, lot_id, kind, reason)
         VALUES ($1, $2, 'outbid', $3)
         ON CONFLICT (user_id, lot_id, kind)
         DO UPDATE SET reason = EXCLUDED.reason, created_at = now(), read_at = NULL`,
        [high.user_id, lotId, `${bidder.name} bid ${check.amount} on "${lot.title}"`]
      );
    }

    return { ok: true, amount: check.amount, rounded: check.rounded };
  });
}

module.exports = { validateBid, placeBid, bidIncrement, nextBid, maxBid, INCREMENTS };
