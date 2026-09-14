const express = require('express');

const router = express.Router();

router.get('/items/:id', (req, res) => {
  res.render('layout', { title: 'Lot', view: 'stub' });
});

router.post('/items/:id/like', (req, res) => {
  res.render('layout', { title: 'Like', view: 'stub' });
});

router.post('/items/:id/bid', (req, res) => {
  res.render('layout', { title: 'Bid', view: 'stub' });
});

module.exports = router;
