const express = require('express');
const { db, getUser, highBid, itemWithImages } = require('../db/db');
const { renderPage, userId, withItemState, redirectWithError } = require('./helpers');

const router = express.Router({ mergeParams: true });

router.get('/items/:id', (req, res) => {
  const item = withItemState(itemWithImages(req.params.id), userId(req));
  if (!item) return res.status(404).send('Lot not found');
  const bids = db.prepare(`
    SELECT b.*, u.name FROM bids b JOIN users u ON u.id = b.user_id
    WHERE b.item_id = ? ORDER BY b.placed_at DESC, b.id DESC
  `).all(item.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(item.sale_id);
  const winner = item.hammer_price ? highBid(item.id) : null;
  renderPage(res, 'item', {
    title: item.title, item, sale, bids, winner, userId: userId(req),
    error: req.query.error
  });
});

router.post('/u/:userId/items/:itemId/favorite', (req, res) => {
  const existing = db.prepare(
    'SELECT 1 FROM favorites WHERE user_id = ? AND item_id = ?'
  ).get(req.params.userId, req.params.itemId);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?')
      .run(req.params.userId, req.params.itemId);
  } else {
    db.prepare('INSERT INTO favorites (user_id, item_id) VALUES (?, ?)')
      .run(req.params.userId, req.params.itemId);
  }
  res.redirect(`/u/${req.params.userId}/summary`);
});

router.post('/u/:userId/items/:itemId/bid', (req, res) => {
  const item = itemWithImages(req.params.itemId);
  if (!item) return res.status(404).send('Lot not found');
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(item.sale_id);
  const amount = Number(req.body.amount);
  if (sale.status !== 'open') {
    return redirectWithError(res, `/items/${item.id}?u=${req.params.userId}`, 'Bidding is closed');
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return redirectWithError(res, `/items/${item.id}?u=${req.params.userId}`, 'Enter a whole-number bid');
  }
  const current = db.prepare('SELECT MAX(amount) AS amount FROM bids WHERE item_id = ?')
    .get(item.id).amount;
  const minimum = current ?? (item.starting_bid ?? item.estimate_low);
  const valid = current === null ? amount >= minimum : amount > minimum;
  if (!valid) {
    return redirectWithError(res, `/items/${item.id}?u=${req.params.userId}`,
      `Bid must be ${current === null ? 'at least' : 'more than'} ${minimum}`);
  }
  db.prepare('INSERT INTO bids (item_id, user_id, amount) VALUES (?, ?, ?)')
    .run(item.id, req.params.userId, amount);
  res.redirect(`/items/${item.id}?u=${req.params.userId}`);
});

module.exports = router;
