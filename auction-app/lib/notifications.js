// Read-side helpers for the in-app notification feed.
// Other parts of the app INSERT notification rows; this file only reads and marks them.
const { query, withTransaction } = require('../db/db');

async function unreadCount(userId) {
  const result = await query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return result.rows[0].count;
}

// Newest first (all rows unless a limit is given). Each row carries the lot title so the feed can link to the lot.
async function listFeed(userId, limit = null) {
  const result = await query(
    `SELECT n.id, n.lot_id, n.kind, n.reason, n.created_at, n.read_at, l.title AS lot_title
     FROM notifications n
     JOIN lots l ON l.id = n.lot_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function markAllRead(userId) {
  await withTransaction((client) =>
    client.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    )
  );
}

module.exports = { unreadCount, listFeed, markAllRead };
