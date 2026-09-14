const express = require('express');

const router = express.Router();

router.get('/u/:userId/preferences', (req, res) => {
  res.render('layout', { title: 'Preferences', view: 'stub' });
});

router.post('/u/:userId/preferences', (req, res) => {
  res.render('layout', { title: 'Preferences', view: 'stub' });
});

module.exports = router;
