const express = require('express');
const { query } = require('../db/db');
const { renderPage } = require('./helpers');
const { matchLot } = require('../lib/matching');
const { unreadCount, listFeed, markAllRead } = require('../lib/notifications');
const { formatUtc } = require('../lib/time');

const router = express.Router();

// One row per lot in an open auction, with the first image and current high bid.
const OPEN_LOTS_SQL = `
  SELECT l.id, l.title, l.artist, l.category, l.description, l.currency,
         l.estimate_low, l.estimate_high, l.starting_bid,
         a.id AS auction_id, a.title AS auction_title,
         (SELECT url FROM lot_images WHERE lot_id = l.id ORDER BY position LIMIT 1) AS image_url,
         (SELECT MAX(amount) FROM bids WHERE lot_id = l.id) AS current_bid
  FROM lots l
  JOIN auctions a ON a.id = l.auction_id
  WHERE a.status = 'open'`;

router.get('/u/:userId/summary', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!res.locals.user) return res.status(404).send('User not found');

    const prefsResult = await query(
      `SELECT p.categories, p.artists, p.keywords
       FROM users u
       LEFT JOIN preferences p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const prefs = prefsResult.rows[0] && prefsResult.rows[0].categories ? prefsResult.rows[0] : null;

    const openLots = (await query(`${OPEN_LOTS_SQL} ORDER BY a.id, l.lot_number, l.id`)).rows;
    const matches = [];
    for (const lot of openLots) {
      const { matched, reasons } = matchLot(lot, prefs);
      if (matched) matches.push({ ...lot, reasons });
      if (matches.length === 12) break;
    }

    // Random open lots the user has not bid on, favorited, or already sees in Matches.
    const discover = (await query(
      `${OPEN_LOTS_SQL}
         AND l.id NOT IN (SELECT lot_id FROM bids WHERE user_id = $1)
         AND l.id NOT IN (SELECT lot_id FROM favorites WHERE user_id = $1)
         AND NOT (l.id = ANY($2::bigint[]))
       ORDER BY random()
       LIMIT 5`,
      [userId, matches.map((lot) => lot.id)]
    )).rows;

    renderPage(res, 'Summary', 'summary', {
      userId,
      hasPreferences: prefs !== null,
      matches,
      discover,
      notifications: await listFeed(userId),
      unread: await unreadCount(userId),
      flash: req.query.flash || '',
      formatUtc
    });
  } catch (error) {
    next(error);
  }
});

router.post('/u/:userId/notifications/read', async (req, res, next) => {
  try {
    await markAllRead(Number(req.params.userId));
    res.redirect(`/u/${req.params.userId}/summary`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
