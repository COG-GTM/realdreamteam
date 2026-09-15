const express = require('express');
const { query } = require('../db/db');
const { renderPage } = require('./helpers');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, avatar_url FROM users WHERE banned = false ORDER BY name'
    );
    renderPage(res, 'Choose a profile', 'index', { users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.use(require('./summary'));
router.use(require('./preferences'));
router.use(require('./auctions'));
router.use(require('./lots'));
router.use(require('./history'));
router.use(require('./admin'));
router.use(require('./panes'));

module.exports = router;
