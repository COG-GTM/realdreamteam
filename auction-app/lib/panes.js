const { query } = require('../db/db');
const { listFeed, unreadCount } = require('./notifications');

const OPEN_AUCTIONS_SQL = `
  SELECT a.id, a.title, a.closes_at, h.name AS house_name,
         (SELECT COUNT(*)::int FROM lots l WHERE l.auction_id = a.id) AS lot_count
  FROM auctions a
  JOIN auction_houses h ON h.id = a.auction_house_id
  WHERE a.status = 'open'
  ORDER BY a.closes_at NULLS LAST, a.starts_at`;

async function paneData(userId) {
  const openPromise = query(OPEN_AUCTIONS_SQL);
  if (!userId) {
    const openAuctions = (await openPromise).rows;
    return { openAuctions, notifications: [], unread: 0 };
  }

  const [openResult, notifications, unread] = await Promise.all([
    openPromise,
    listFeed(userId),
    unreadCount(userId)
  ]);
  return {
    openAuctions: openResult.rows,
    notifications,
    unread
  };
}

module.exports = { paneData };
