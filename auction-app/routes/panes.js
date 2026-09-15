const express = require('express');
const { paneData } = require('../lib/panes');
const { formatCentral, userPath } = require('../lib/format');

const router = express.Router();

async function renderPane(req, res, view) {
  const userId = req.query.u || '';
  const data = await paneData(userId);
  res.set('Cache-Control', 'no-store');
  res.render(view, { ...data, userId, formatCentral, userPath });
}

router.get('/panes/auctions', async (req, res, next) => {
  try {
    await renderPane(req, res, 'partials/pane-auctions');
  } catch (error) {
    next(error);
  }
});

router.get('/panes/feed', async (req, res, next) => {
  try {
    await renderPane(req, res, 'partials/pane-feed');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
