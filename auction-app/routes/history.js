const express = require('express');
const { db, getUser, highBid } = require('../db/db');
const { renderPage } = require('./helpers');

const router = express.Router({ mergeParams: true });

router.get('/u/:userId/history', (req, res) => {
  const user = getUser(req.params.userId);
  if (!user) return res.status(404).send('User not found');
  const favorites = db.prepare(`
    SELECT f.created_at, i.*, s.title AS sale_title FROM favorites f
    JOIN items i ON i.id = f.item_id JOIN sales s ON s.id = i.sale_id
    WHERE f.user_id = ? ORDER BY f.created_at DESC
  `).all(user.id);
  const bids = db.prepare(`
    SELECT b.*, i.title, i.id AS item_id, i.hammer_price, i.currency,
           s.title AS sale_title, winner.name AS high_bidder
    FROM bids b JOIN items i ON i.id = b.item_id JOIN sales s ON s.id = i.sale_id
    LEFT JOIN users winner ON winner.id = (
      SELECT b2.user_id FROM bids b2 WHERE b2.item_id = i.id
      ORDER BY b2.amount DESC, b2.id DESC LIMIT 1
    )
    WHERE b.user_id = ? ORDER BY b.placed_at DESC, b.id DESC
  `).all(user.id).map((bid) => {
    const high = highBid(bid.item_id);
    return {
      ...bid,
      result: bid.hammer_price
        ? (high && high.user_id === user.id ? 'won' : 'lost')
        : (high && high.user_id === user.id ? 'you are the high bidder' : `outbid by ${bid.high_bidder}`)
    };
  });
  const tickets = db.prepare(`
    SELECT t.booked_at, s.* FROM tickets t JOIN sales s ON s.id = t.sale_id
    WHERE t.user_id = ? ORDER BY t.booked_at DESC
  `).all(user.id);
  renderPage(res, 'history', { title: 'Your history', user, favorites, bids, tickets });
});

module.exports = router;
