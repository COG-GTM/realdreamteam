const express = require('express');
const { db } = require('../db/db');
const { allSales, itemsForSale, renderPage, userId } = require('./helpers');

const router = express.Router({ mergeParams: true });

router.get('/sales', (req, res) => {
  renderPage(res, 'sales', { title: 'Sales', sales: allSales(), userId: userId(req) });
});

router.get('/sales/:id', (req, res) => {
  const sale = db.prepare(`
    SELECT s.*, h.name AS auction_house, h.website AS auction_house_website
    FROM sales s JOIN auction_houses h ON h.id = s.auction_house_id WHERE s.id = ?
  `).get(req.params.id);
  if (!sale) return res.status(404).send('Sale not found');
  renderPage(res, 'sale', {
    title: sale.title,
    sale,
    items: itemsForSale(sale.id, userId(req)),
    userId: userId(req)
  });
});

router.post('/u/:userId/sales/:saleId/ticket', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO tickets (user_id, sale_id) VALUES (?, ?)')
    .run(req.params.userId, req.params.saleId);
  res.redirect(`/u/${req.params.userId}/summary`);
});

module.exports = router;
