const express = require('express');
const { query } = require('../db/db');
const { renderPage } = require('./helpers');
const { formatCentral, formatMoney, userPath } = require('../lib/format');

const router = express.Router();

function userIdFrom(req) {
  return req.params.userId || req.query.u || '';
}

async function listAuctions(req, res, next) {
  try {
    const result = await query(
      `SELECT a.*, h.name AS house_name, h.logo_url,
              (SELECT COUNT(*)::int FROM lots l WHERE l.auction_id = a.id) AS lot_count
       FROM auctions a JOIN auction_houses h ON h.id = a.auction_house_id
       ORDER BY a.starts_at`
    );
    const groups = { open: [], upcoming: [], closed: [] };
    for (const auction of result.rows) {
      (groups[auction.status] || groups.upcoming).push(auction);
    }
    renderPage(res, 'Auctions', 'auctions', {
      userId: userIdFrom(req),
      groups,
      flash: req.query.flash || null,
      error: req.query.error ? req.query.flash : null,
      formatCentral,
      userPath
    });
  } catch (error) {
    next(error);
  }
}

async function showAuction(req, res, next) {
  try {
    const userId = userIdFrom(req);
    const auctionResult = await query(
      `SELECT a.*, h.name AS house_name, h.location AS house_location, h.logo_url, h.website
       FROM auctions a JOIN auction_houses h ON h.id = a.auction_house_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    const auction = auctionResult.rows[0];
    if (!auction) {
      res.status(404);
      return renderPage(res, 'Not found', 'coming-soon', {
        message: 'That auction does not exist.',
        path: req.path
      });
    }
    const lotsResult = await query(
      `SELECT l.*, a.status,
        (SELECT url FROM lot_images i WHERE i.lot_id = l.id ORDER BY position LIMIT 1) AS image_url,
        hb.amount AS current_bid, hu.name AS high_bidder,
        w.name AS winner_name,
        EXISTS (SELECT 1 FROM favorites f WHERE f.lot_id = l.id AND f.user_id = $2::bigint) AS favorited
       FROM lots l
       JOIN auctions a ON a.id = l.auction_id
       LEFT JOIN LATERAL (SELECT user_id, amount FROM bids b WHERE b.lot_id = l.id ORDER BY amount DESC, placed_at ASC, id ASC LIMIT 1) hb ON true
       LEFT JOIN users hu ON hu.id = hb.user_id
       LEFT JOIN users w ON w.id = l.winner_user_id
       WHERE l.auction_id = $1
       ORDER BY l.lot_number, l.id`,
      [req.params.id, userId || null]
    );
    renderPage(res, auction.title, 'auction', {
      userId,
      auction,
      lots: lotsResult.rows,
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

router.get('/u/:userId/auctions', listAuctions);
router.get('/auctions', listAuctions);
router.get('/u/:userId/auctions/:id', showAuction);
router.get('/auctions/:id', showAuction);

module.exports = router;
