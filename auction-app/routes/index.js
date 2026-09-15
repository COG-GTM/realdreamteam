const express = require('express');
const { query } = require('../db/db');
const preferences = require('./preferences');
const summary = require('./summary');
const events = require('./events');
const items = require('./items');
const admin = require('./admin');

function createRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { rows: users } = await query('SELECT id, name FROM users ORDER BY id');
    res.render('layout', { title: 'Auction Interest App', view: 'index', users });
  });

  router.post('/', (req, res) => {
    const userId = Number.parseInt(req.body.userId, 10);
    if (Number.isInteger(userId)) return res.redirect(`/u/${userId}/summary`);
    return res.redirect('/');
  });

  router.use(preferences);
  router.use(summary);
  router.use(events);
  router.use(items);
  router.use(admin);
  return router;
}

module.exports = createRouter;
