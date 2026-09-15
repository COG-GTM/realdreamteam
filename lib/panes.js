const { query } = require('../db/db');
const { listFeed, unreadCount } = require('./notifications');
const { recentActivity } = require('./activity');

const OPEN_AUCTIONS_SQL = `
  SELECT a.id, a.title, a.closes_at, h.name AS house_name,
         (SELECT COUNT(*)::int FROM lots l WHERE l.auction_id = a.id) AS lot_count
  FROM auctions a
  JOIN auction_houses h ON h.id = a.auction_house_id
  WHERE a.status = 'open'
  ORDER BY a.closes_at NULLS LAST, a.starts_at`;

async function paneData(userId) {
  const openPromise = query(OPEN_AUCTIONS_SQL);
  const activityPromise = recentActivity();
  if (!userId) {
    const [openResult, liveActivity] = await Promise.all([openPromise, activityPromise]);
    return { openAuctions: openResult.rows, notifications: [], unread: 0, liveActivity };
  }

  const [openResult, notifications, unread, liveActivity] = await Promise.all([
    openPromise,
    listFeed(userId),
    unreadCount(userId),
    activityPromise
  ]);
  return {
    openAuctions: openResult.rows,
    notifications,
    unread,
    liveActivity
  };
}

module.exports = { paneData };
