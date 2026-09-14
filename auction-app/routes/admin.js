const express = require('express');

const router = express.Router();

router.get('/admin/items', (req, res) => {
  res.render('layout', { title: 'Admin', view: 'stub' });
});

router.post('/admin/items', (req, res) => {
  res.render('layout', { title: 'Admin', view: 'stub' });
});

module.exports = router;
