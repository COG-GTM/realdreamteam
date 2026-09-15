const express = require('express');
const { db } = require('../db/db');
const { processNewItem } = require('../lib/poller');
const { allSales, itemsForSale, renderPage } = require('./helpers');

const router = express.Router();
const categories = [
  'Contemporary Art', 'Photography', 'Watches', 'Cars',
  'Jewellery', 'Wine & Spirits', 'Design', 'Books & Manuscripts'
];

function nextLotNumber(saleId) {
  const row = db.prepare('SELECT MAX(lot_number) AS number FROM items WHERE sale_id = ?').get(saleId);
  return (row.number || 0) + 1;
}

function lotId(sale, lotNumber) {
  const prefix = { London: '10', Geneva: '20', 'New York': '30' }[sale.location] || '90';
  return `lot-${prefix}${lotNumber}`;
}

router.get('/admin', (req, res) => {
  const sales = allSales().map((sale) => ({
    ...sale, itemCount: db.prepare('SELECT COUNT(*) AS count FROM items WHERE sale_id = ?').get(sale.id).count
  }));
  renderPage(res, 'admin', {
    title: 'Admin', sales, categories,
    nextLot: nextLotNumber(sales[0]?.id || ''),
    added: req.query.added ? `Lot added; notified ${req.query.added} users` : null,
    sold: req.query.sold
  });
});

router.post('/admin/items', async (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.body.saleId);
  if (!sale) return res.status(400).send('Sale not found');
  const lotNumber = Number(req.body.lotNumber) || nextLotNumber(sale.id);
  const item = {
    id: lotId(sale, lotNumber),
    saleId: sale.id, lotNumber, title: req.body.title, artist: req.body.artist || null,
    category: req.body.category, description: req.body.description || null,
    currency: req.body.currency || (sale.location === 'London' ? 'GBP' : sale.location === 'Geneva' ? 'CHF' : 'USD'),
    estimateLow: Number(req.body.estimateLow) || null,
    estimateHigh: Number(req.body.estimateHigh) || null,
    startingBid: Number(req.body.startingBid) || Number(req.body.estimateLow) || null,
    sourceUrl: req.body.sourceUrl || null,
    images: req.body.imageUrl ? [{ url: req.body.imageUrl, credit: 'Added by admin' }] : []
  };
  const notified = await processNewItem(db, item);
  res.redirect(`/admin?added=${notified}`);
});

router.post('/admin/sales/:id/close', (req, res) => {
  db.transaction(() => {
    db.prepare("UPDATE sales SET status = 'closed' WHERE id = ?").run(req.params.id);
    db.prepare(`
      UPDATE items SET hammer_price = (
        SELECT MAX(amount) FROM bids WHERE bids.item_id = items.id
      ) WHERE sale_id = ?
    `).run(req.params.id);
  })();
  res.redirect(`/admin?sold=${encodeURIComponent(req.params.id)}`);
});

router.post('/admin/sales/:id/reopen', (req, res) => {
  db.transaction(() => {
    db.prepare("UPDATE sales SET status = 'open' WHERE id = ?").run(req.params.id);
    db.prepare('UPDATE items SET hammer_price = NULL WHERE sale_id = ?').run(req.params.id);
  })();
  res.redirect('/admin');
});

module.exports = router;
