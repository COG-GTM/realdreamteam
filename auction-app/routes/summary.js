const express = require('express');
const { renderStub } = require('./helpers');

const router = express.Router();
router.get('/u/:userId/summary', (req, res) => {
  renderStub(req, res, 'Summary', 'Matches and Discover arrive in the next build step.');
});

module.exports = router;
