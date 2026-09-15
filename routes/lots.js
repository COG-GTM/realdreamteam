const express = require('express');
const { query, withTransaction } = require('../db/db');
const { renderPage, flashUrl } = require('./helpers');
const { formatCentral, formatMoney, userPath } = require('../lib/format');
const { placeBid } = require('../lib/bids');
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
              w.name AS winner_name
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
        `SELECT b.amount, b.placed_at, u.name
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

    renderPage(res, lot.title, 'lot', {
      userId,
      lot,
      images: imagesResult.rows,
      bids,
      highBid,
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
    res.redirect(flashUrl(target, 'Bid placed!', false));
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
