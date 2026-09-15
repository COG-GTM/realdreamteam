const express = require('express');
const { query, withTransaction } = require('../db/db');
const { renderPage, flashUrl } = require('./helpers');
const { formatCentral, formatMoney, userPath } = require('../lib/format');
const { placeBid, bidIncrement, nextBid, maxBid, INCREMENTS } = require('../lib/bids');
const { logActivity } = require('../lib/activity');
const { pickWinner } = require('../lib/close');

const router = express.Router();

function userIdFrom(req) {
  return req.params.userId || req.query.u || '';
}

async function showLot(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const lotResult = await query(
      `SELECT l.*, a.title AS auction_title, a.status AS auction_status, a.format,
              a.starts_at, a.closes_at, h.name AS house_name,
              w.name AS winner_name, w.avatar_url AS winner_avatar_url,
              w.avatar_data IS NOT NULL AS winner_has_upload
       FROM lots l
       JOIN auctions a ON a.id = l.auction_id
       JOIN auction_houses h ON h.id = a.auction_house_id
       LEFT JOIN users w ON w.id = l.winner_user_id
       WHERE l.id = $1`,
      [req.params.lotId]
    );
    const lot = lotResult.rows[0];
    if (!lot) {
      res.status(404);
      return renderPage(res, 'Not found', 'coming-soon', {
        message: 'That lot does not exist.',
        path: req.path
      });
    }

    const [imagesResult, bidsResult, favoriteResult] = await Promise.all([
      query('SELECT url, credit FROM lot_images WHERE lot_id = $1 ORDER BY position', [lot.id]),
      query(
        `SELECT b.id AS bid_id, b.user_id, b.amount, b.placed_at, u.id, u.name, u.avatar_url, u.avatar_data IS NOT NULL AS has_upload
         FROM bids b JOIN users u ON u.id = b.user_id
         WHERE b.lot_id = $1 ORDER BY b.placed_at DESC, b.id DESC`,
        [lot.id]
      ),
      userId
        ? query('SELECT 1 FROM favorites WHERE user_id = $1 AND lot_id = $2', [userId, lot.id])
        : Promise.resolve({ rows: [] })
    ]);

    const bids = bidsResult.rows;
    const highBid = pickWinner(bids);
    const bidInfo = {
      highBid: highBid ? Number(highBid.amount) : null,
      startingBid: lot.starting_bid == null ? null : Number(lot.starting_bid),
      estimateLow: lot.estimate_low == null ? null : Number(lot.estimate_low)
    };

    renderPage(res, lot.title, 'lot', {
      userId,
      lot,
      images: imagesResult.rows,
      bids,
      highBid,
      nextBid: nextBid(bidInfo),
      maxBid: maxBid(bidInfo),
      increment: bidIncrement(bidInfo.highBid ?? bidInfo.startingBid ?? bidInfo.estimateLow ?? 0),
      INCREMENTS,
      isHighBidder: Boolean(highBid && userId && Number(highBid.user_id) === Number(userId)),
      favorited: favoriteResult.rows.length > 0,
      flash: req.query.flash || null,
      error: req.query.error ? req.query.flash : null,
      formatCentral,
      formatMoney,
      userPath
    });
  } catch (error) {
    next(error);
  }
}

async function postBid(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const lotId = req.params.lotId;
    const result = await placeBid({ userId, lotId, amount: req.body.amount });
    const target = userPath(userId, `/lots/${lotId}`);
    if (!result.ok) {
      return res.redirect(flashUrl(target, result.error, true));
    }
    const message = result.rounded
      ? `Bid placed at ${formatMoney(result.amount, '')} (rounded down to the nearest bid step).`
      : 'Bid placed!';
    res.redirect(flashUrl(target, message, false));
  } catch (error) {
    next(error);
  }
}

async function postFavorite(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const lotId = req.params.lotId;
    await withTransaction(async (client) => {
      const removed = await client.query(
        'DELETE FROM favorites WHERE user_id = $1 AND lot_id = $2',
        [userId, lotId]
      );
      if (removed.rowCount === 0) {
        await client.query(
          'INSERT INTO favorites (user_id, lot_id) VALUES ($1, $2)',
          [userId, lotId]
        );
        await logActivity(client, { kind: 'favorite', actorUserId: userId, lotId });
      }
    });
    res.redirect(req.get('referer') || userPath(userId, `/lots/${lotId}`));
  } catch (error) {
    next(error);
  }
}

router.get('/u/:userId/lots/:lotId', showLot);
router.get('/lots/:lotId', showLot);
router.post('/u/:userId/lots/:lotId/bid', postBid);
router.post('/u/:userId/lots/:lotId/favorite', postFavorite);

module.exports = router;
