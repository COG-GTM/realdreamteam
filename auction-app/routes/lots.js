const express = require('express');
const { renderStub } = require('./helpers');

const router = express.Router();
router.get('/lots/:id', (req, res) => {
  renderStub(req, res, 'Lot', 'Lot detail arrives in the next build step.');
});
router.post('/u/:userId/lots/:lotId/favorite', (req, res) => {
  res.redirect(req.get('referer') || `/lots/${req.params.lotId}`);
});
router.post('/u/:userId/lots/:lotId/bid', (req, res) => {
  res.redirect(req.get('referer') || `/lots/${req.params.lotId}`);
});

module.exports = router;
