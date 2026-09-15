const express = require('express');
const { query, withTransaction } = require('../db/db');
const { renderPage } = require('./helpers');
const { categories } = require('../lib/categories');
const { createLot } = require('../lib/new-lot');
const { closeAuction, validateClosesAt } = require('../lib/close');
const { formatCentral, toCentralInput } = require('../lib/time');
const { gateCookieOptions } = require('../lib/cookies');
const { gateLimiter } = require('../lib/rate-limit');

const router = express.Router();
const adminLimiter = gateLimiter();

const ADMIN_HINT = 'The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE), ISO 8601 basic format…';

router.get('/admin/enter', (req, res) => {
  renderPage(res, 'Admin access', 'enter', {
    gate: true,
    admin: true,
    hint: ADMIN_HINT,
    u: req.query.u || ''
  });
});

router.post('/admin/enter', adminLimiter, (req, res) => {
  if (req.rateLimited) {
    res.status(429);
    return renderPage(res, 'Admin access', 'enter', {
      gate: true,
      admin: true,
      error: 'Too many attempts. Try again in a few minutes.',
      hint: ADMIN_HINT,
      u: req.body.u || ''
    });
  }
  const expected = process.env.ADMIN_CODE || '20250714';
  if (String(req.body.code || '') !== expected) {
    adminLimiter.recordFailure(req);
    return renderPage(res, 'Admin access', 'enter', {
      gate: true,
      admin: true,
      error: 'That code did not match.',
      hint: ADMIN_HINT,
      u: req.body.u || ''
    });
  }
  res.cookie('rdt_admin', 'session', gateCookieOptions());
  const userId = String(req.body.u || '');
  res.redirect(`/admin${/^\d+$/.test(userId) ? `?u=${userId}` : ''}`);
});

// Builds "/admin?flash=...&u=..." so the user in the nav is kept.
function adminUrl(req, params = {}) {
  const search = new URLSearchParams();
  const userId = req.body.u || req.query.u;
  if (userId) search.set('u', userId);
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `/admin?${text}` : '/admin';
}

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).send('Not found');
  next();
});

router.get('/admin', async (req, res, next) => {
  try {
    const auctions = (await query(
      `SELECT a.*, h.name AS house,
              (SELECT COUNT(*)::int FROM lots l WHERE l.auction_id = a.id) AS lot_count,
              (SELECT COUNT(*)::int FROM bids b JOIN lots l ON l.id = b.lot_id WHERE l.auction_id = a.id) AS bid_count
       FROM auctions a JOIN auction_houses h ON h.id = a.auction_house_id
       ORDER BY a.starts_at, a.id`
    )).rows;
    const users = (await query(
      `SELECT u.id, u.name, u.email, u.banned,
              (SELECT COUNT(*)::int FROM bids b WHERE b.user_id = u.id) AS bid_count
       FROM users u ORDER BY u.name`
    )).rows;
    renderPage(res, 'Admin', 'admin', {
      auctions,
      users,
      categories,
      flash: req.query.flash || '',
      error: req.query.error || '',
      sold: req.query.sold || '',
      forInput: toCentralInput,
      central: formatCentral,
      u: req.query.u || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/lots', async (req, res, next) => {
  try {
    const { lot, notified } = await createLot(req.body);
    res.redirect(adminUrl(req, { flash: `Lot added: "${lot.title}" (${notified} user${notified === 1 ? '' : 's'} notified)` }));
  } catch (error) {
    if (!error.status) return next(error);
    res.redirect(adminUrl(req, { error: error.message }));
  }
});

router.post('/admin/auctions/:id/closes_at', async (req, res, next) => {
  try {
    const auction = (await query('SELECT id, starts_at FROM auctions WHERE id = $1', [req.params.id])).rows[0];
    if (!auction) return res.status(404).send('Auction not found');
    const checked = validateClosesAt(req.body.closes_at, auction.starts_at);
    if (checked.error) return res.redirect(adminUrl(req, { error: checked.error }));
    try {
      await withTransaction((client) =>
        client.query('UPDATE auctions SET closes_at = $2 WHERE id = $1', [auction.id, checked.value])
      );
    } catch (dbError) {
      return res.redirect(adminUrl(req, { error: `Could not save time: ${dbError.message}` }));
    }
    res.redirect(adminUrl(req, { flash: `Close time saved: ${formatCentral(checked.value)}` }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/auctions/:id/close', async (req, res, next) => {
  try {
    const result = await closeAuction(req.params.id);
    if (!result.closed) return res.redirect(adminUrl(req, { error: 'That auction is not open.' }));
    res.redirect(adminUrl(req, {
      flash: `Auction closed: ${result.lotsSold} sold, ${result.lotsUnsold} unsold`,
      sold: req.params.id
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/auctions/:id/reopen', async (req, res, next) => {
  try {
    const reopened = await withTransaction(async (client) => {
      const auction = (await client.query('SELECT * FROM auctions WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!auction || auction.status !== 'closed') return false;
      // Push closes_at into the future so the poller does not close it again.
      await client.query(
        `UPDATE auctions SET status = 'open',
           closes_at = GREATEST(closes_at, now() + interval '1 hour')
         WHERE id = $1`,
        [auction.id]
      );
      await client.query(
        'UPDATE lots SET hammer_price = NULL, winner_user_id = NULL WHERE auction_id = $1',
        [auction.id]
      );
      return true;
    });
    if (!reopened) return res.redirect(adminUrl(req, { error: 'That auction is not closed.' }));
    res.redirect(adminUrl(req, { flash: 'Auction reopened; it now closes at least an hour from now.' }));
  } catch (error) {
    next(error);
  }
});

router.post('/admin/users/:id/ban', async (req, res, next) => {
  try {
    const user = (await withTransaction((client) =>
      client.query('UPDATE users SET banned = NOT banned WHERE id = $1 RETURNING name, banned', [req.params.id])
    )).rows[0];
    if (!user) return res.status(404).send('User not found');
    res.redirect(adminUrl(req, { flash: `${user.name} ${user.banned ? 'banned' : 'unbanned'}` }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
