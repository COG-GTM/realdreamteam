const express = require('express');
const { renderStub } = require('./helpers');

const router = express.Router();
router.get('/u/:userId/history', (req, res) => {
  renderStub(req, res, 'History', 'Bid and notification history arrives in the next build step.');
});
router.post('/u/:userId/notifications/read', (req, res) => {
  res.redirect(`/u/${req.params.userId}/history`);
});

module.exports = router;
