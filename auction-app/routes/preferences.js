const express = require('express');
const { db } = require('../db/db');
const { getUser, renderPage } = require('./helpers');

const router = express.Router({ mergeParams: true });
const categories = [
  'Contemporary Art', 'Photography', 'Watches', 'Cars',
  'Jewellery', 'Wine & Spirits', 'Design', 'Books & Manuscripts'
];

router.get('/u/:userId/preferences', (req, res) => {
  const user = getUser(req.params.userId);
  if (!user) return res.status(404).send('User not found');
  renderPage(res, 'preferences', { title: 'Preferences', user, categories });
});

router.post('/u/:userId/preferences', (req, res) => {
  const values = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  db.prepare(`
    INSERT INTO preferences (user_id, categories, artists, keywords, min_price, max_price)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      categories = excluded.categories, artists = excluded.artists,
      keywords = excluded.keywords, min_price = excluded.min_price, max_price = excluded.max_price
  `).run(
    req.params.userId,
    JSON.stringify(values(req.body.categories)),
    JSON.stringify(String(req.body.artists || '').split(',').map((x) => x.trim()).filter(Boolean)),
    JSON.stringify(String(req.body.keywords || '').split(',').map((x) => x.trim()).filter(Boolean)),
    req.body.minPrice ? Number(req.body.minPrice) : null,
    req.body.maxPrice ? Number(req.body.maxPrice) : null
  );
  res.redirect(`/u/${req.params.userId}/preferences?saved=1`);
});

module.exports = router;
