// Closing an auction: pick the winning bid on every lot, mark the auction
// closed and tell every bidder the result. Used by the admin "Close now"
// button and by the poller when closes_at passes.
const { withTransaction } = require('../db/db');
const { money } = require('./slack');

// Highest amount wins; on a tie the earliest bid wins. Returns null when there
// are no bids. Pure, so it is unit-tested without a database.
function pickWinner(bids) {
  let winner = null;
  for (const bid of bids) {
    if (!winner) {
      winner = bid;
    } else if (bid.amount > winner.amount) {
      winner = bid;
    } else if (bid.amount === winner.amount && new Date(bid.placed_at) < new Date(winner.placed_at)) {
      winner = bid;
    }
  }
  return winner;
}

function soldReason(winnerName, price, currency, isWinner) {
  const base = `Sold to ${winnerName} for ${money(price, currency)}`;
  return isWinner ? `${base} — congratulations!` : `${base} — better luck next time`;
}

// Turns the admin's closes_at text into a Date. Returns { value } or { error }.
// The text is read as UTC when it has no explicit zone (the form is labelled UTC).
function validateClosesAt(text, startsAt) {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'Close time is required.' };
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const value = new Date(withZone);
  if (Number.isNaN(value.getTime())) return { error: 'Close time must be a valid date and time.' };
  if (startsAt && value <= new Date(startsAt)) return { error: 'Close time must be after the start time.' };
  return { value };
}

async function closeAuction(auctionId) {
  return withTransaction(async (client) => {
    const auctionResult = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
      [auctionId]
    );
    const auction = auctionResult.rows[0];
    if (!auction || auction.status !== 'open') return { closed: false };

    const lots = (await client.query(
      'SELECT id, currency FROM lots WHERE auction_id = $1 ORDER BY id FOR UPDATE',
      [auctionId]
    )).rows;

    let lotsSold = 0;
    let lotsUnsold = 0;
    for (const lot of lots) {
      const bids = (await client.query(
        `SELECT b.user_id, b.amount, b.placed_at, u.name
         FROM bids b JOIN users u ON u.id = b.user_id
         WHERE b.lot_id = $1`,
        [lot.id]
      )).rows;
      const winner = pickWinner(bids);
      if (!winner) {
        lotsUnsold += 1;
        continue;
      }
      lotsSold += 1;
      await client.query(
        'UPDATE lots SET hammer_price = $2, winner_user_id = $3 WHERE id = $1',
        [lot.id, winner.amount, winner.user_id]
      );
      const bidderIds = [...new Set(bids.map((bid) => bid.user_id))];
      for (const userId of bidderIds) {
        const reason = soldReason(winner.name, winner.amount, lot.currency, userId === winner.user_id);
        await client.query(
          `INSERT INTO notifications (user_id, lot_id, kind, reason)
           VALUES ($1, $2, 'sold', $3)
           ON CONFLICT (user_id, lot_id, kind)
           DO UPDATE SET reason = EXCLUDED.reason, created_at = now(), read_at = NULL`,
          [userId, lot.id, reason]
        );
      }
    }

    // Closing early (before closes_at) records the real close time.
    await client.query(
      `UPDATE auctions
       SET status = 'closed',
           closes_at = CASE WHEN closes_at IS NULL OR closes_at > now() THEN now() ELSE closes_at END
       WHERE id = $1`,
      [auctionId]
    );
    return { closed: true, lotsSold, lotsUnsold };
  });
}

module.exports = { closeAuction, pickWinner, soldReason, validateClosesAt };
