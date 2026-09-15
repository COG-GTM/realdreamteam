const express = require('express');
const { getUser, renderPage } = require('./helpers');
const preferences = require('./preferences');
const summary = require('./summary');
const sales = require('./sales');
const items = require('./items');
const history = require('./history');
const admin = require('./admin');

const router = express.Router();

router.get('/', (req, res) => {
  renderPage(res, 'index', {
    title: 'Who are you?',
    users: require('../db/db').db.prepare('SELECT id, name FROM users ORDER BY id').all()
  });
});

router.use(preferences);
router.use(summary);
router.use(sales);
router.use(items);
router.use(history);
router.use(admin);

module.exports = router;
