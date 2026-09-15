const express = require('express');
const { renderPage, renderStub } = require('./helpers');

const router = express.Router();

router.get('/admin/enter', (req, res) => {
  renderPage(res, 'Admin access', 'enter', {
    admin: true,
    hint: 'The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE), ISO 8601 basic format…'
  });
});

router.post('/admin/enter', (req, res) => {
  const expected = process.env.ADMIN_CODE || '20250714';
  if (String(req.body.code || '') !== expected) {
    return renderPage(res, 'Admin access', 'enter', {
      admin: true,
      error: 'That code did not match.',
      hint: 'The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE), ISO 8601 basic format…'
    });
  }
  res.cookie('rdt_admin', '1', {
    signed: true,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.redirect('/admin');
});

router.get('/admin', (req, res) => {
  renderStub(req, res, 'Admin', 'Lot publishing and auction controls arrive in the next build step.');
});
router.post('/admin/lots', (req, res) => res.redirect('/admin'));
router.post('/admin/auctions/:id/close', (req, res) => res.redirect(`/admin?sold=${req.params.id}`));
router.post('/admin/auctions/:id/reopen', (req, res) => res.redirect('/admin'));

module.exports = router;
