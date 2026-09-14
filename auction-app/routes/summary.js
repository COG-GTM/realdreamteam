const express = require('express');

const router = express.Router();

router.get('/u/:userId/summary', (req, res) => {
  res.render('layout', { title: 'Summary', view: 'stub' });
});

module.exports = router;
