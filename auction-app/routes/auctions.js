const express = require('express');
const { renderStub } = require('./helpers');

const router = express.Router();
router.get('/auctions', (req, res) => {
  renderStub(req, res, 'Auctions', 'Auction browsing arrives in the next build step.');
});
router.get('/auctions/:id', (req, res) => {
  renderStub(req, res, 'Auction', 'Auction detail arrives in the next build step.');
});

module.exports = router;
