const express = require('express');

const router = express.Router();

router.get('/events', (req, res) => {
  res.render('layout', { title: 'Events', view: 'stub' });
});

router.get('/events/:id', (req, res) => {
  res.render('layout', { title: 'Event', view: 'stub' });
});

router.post('/events/:id/tickets', (req, res) => {
  res.render('layout', { title: 'Tickets', view: 'stub' });
});

module.exports = router;
