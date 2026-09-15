const express = require('express');
const { db, getUser } = require('../db/db');
const { matchesPreferences, matchReasons } = require('../lib/matching');
const { allSales, itemsForSale, renderPage } = require('./helpers');

const router = express.Router({ mergeParams: true });

router.get('/u/:userId/summary', (req, res) => {
  const user = getUser(req.params.userId);
  if (!user) return res.status(404).send('User not found');
  const sales = allSales().map((sale) => {
    const items = itemsForSale(sale.id, user.id)
      .filter((item) => matchesPreferences(item, user.preferences))
      .map((item) => ({ ...item, reasons: matchReasons(item, user.preferences) }));
    const ticket = db.prepare('SELECT 1 FROM tickets WHERE user_id = ? AND sale_id = ?')
      .get(user.id, sale.id);
    return { ...sale, items, ticket: Boolean(ticket) };
  }).filter((sale) => sale.items.length);
  renderPage(res, 'summary', { title: 'Your summary', user, sales });
});

module.exports = router;
