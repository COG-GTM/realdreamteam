// Site-wide activity log behind the "Live" pane: bids, favorites, new lots,
// auctions opening and closing, sales. Writes happen inside the caller's
// transaction via logActivity; reads are the cheap tail query recentActivity.
const { query } = require('../db/db');
const { money } = require('./format');

async function logActivity(client, { kind, actorUserId = null, lotId = null, auctionId = null, amount = null, detail = null }) {
  await client.query(
    `INSERT INTO activity (kind, actor_user_id, lot_id, auction_id, amount, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [kind, actorUserId, lotId, auctionId, amount, detail]
  );
}

async function recentActivity(limit = 15) {
  const result = await query(
    `SELECT a.id, a.kind, a.amount, a.detail, a.created_at, a.lot_id, a.auction_id,
            u.name AS actor_name, l.title AS lot_title, l.currency AS lot_currency,
            au.title AS auction_title, h.name AS house_name
     FROM activity a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN lots l ON l.id = a.lot_id
     LEFT JOIN auctions au ON au.id = a.auction_id
     LEFT JOIN auction_houses h ON h.id = au.auction_house_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// One display sentence for a recentActivity row. Pure, so unit-tested without a database.
function describeActivity(row) {
  switch (row.kind) {
    case 'bid': return `${row.actor_name} bid ${money(row.amount, row.lot_currency)} on ${row.lot_title}`;
    case 'favorite': return `${row.actor_name} favorited ${row.lot_title}`;
    case 'new_lot': return `New lot in ${row.auction_title}: ${row.lot_title}`;
    case 'reoffered': return `${row.lot_title} re-offered in ${row.auction_title}`;
    case 'opened': return `${row.house_name} opened ${row.auction_title}`;
    case 'closed': return `${row.house_name} closed ${row.auction_title}`;
    case 'sold': return `SOLD — ${row.lot_title} to ${row.actor_name} for ${money(row.amount, row.lot_currency)}`;
    default: return row.detail || row.kind;
  }
}

// "12 s ago" style relative time for the Live pane. Pure; pass `now` in tests.
function relativeTime(date, now = new Date()) {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

module.exports = { logActivity, recentActivity, describeActivity, relativeTime };
