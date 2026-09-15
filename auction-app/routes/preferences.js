const express = require('express');
const { renderStub } = require('./helpers');

const router = express.Router();
router.get('/u/:userId/preferences', (req, res) => {
  renderStub(req, res, 'Preferences', 'Preference editing arrives in the next build step.');
});
router.post('/u/:userId/preferences', (req, res) => {
  res.redirect(`/u/${req.params.userId}/preferences`);
});

module.exports = router;
