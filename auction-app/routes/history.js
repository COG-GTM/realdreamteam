const express = require('express');
const { query } = require('../db/db');
const { renderPage } = require('./helpers');
const { formatUtc, formatMoney, userPath } = require('../lib/format');

const router = express.Router();

router.get('/u/:userId/history', async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const bidsResult = await query(
      `SELECT b.id, b.amount, b.placed_at, l.id AS lot_id, l.title, l.currency, a.status, l.winner_user_id,
        (SELECT MAX(amount) FROM bids x WHERE x.lot_id = l.id) AS high_bid
       FROM bids b JOIN lots l ON l.id = b.lot_id JOIN auctions a ON a.id = l.auction_id
       WHERE b.user_id = $1 ORDER BY b.placed_at DESC, b.id DESC`,
      [userId]
    );
    const favoritesResult = await query(
      `SELECT l.id, l.title, l.currency, a.status,
        (SELECT MAX(amount) FROM bids x WHERE x.lot_id = l.id) AS high_bid, f.created_at
       FROM favorites f JOIN lots l ON l.id = f.lot_id JOIN auctions a ON a.id = l.auction_id
       WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    const bids = bidsResult.rows.map((bid) => {
      let state;
      if (bid.status === 'closed') {
        state = Number(bid.winner_user_id) === Number(userId) ? 'Won' : 'Lost';
      } else {
        state = Number(bid.amount) >= Number(bid.high_bid) ? 'Winning' : 'Outbid';
      }
      return { ...bid, state };
    });
    renderPage(res, 'History', 'history', {
      userId,
      bids,
      favorites: favoritesResult.rows,
      flash: req.query.flash || null,
      error: req.query.error ? req.query.flash : null,
      formatUtc,
      formatMoney,
      userPath
    });
  } catch (error) {
    next(error);
  }
});

router.post('/u/:userId/notifications/read', (req, res) => {
  res.redirect(`/u/${req.params.userId}/history`);
});

module.exports = router;
