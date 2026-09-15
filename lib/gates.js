// Express middleware for the two cookie gates (site code, admin code) and the
// per-request user lookup. Wired up in server.js.
const db = require('../db/db');

const SESSION = 'session';

function requireAccess(req, res, next) {
  if (req.signedCookies.rdt_access === SESSION) return next();
  res.redirect('/enter');
}

// Resolves the current user from /u/:id/... or ?u=... into res.locals.
// A ?u= that is not a plain integer id is treated as "no user".
function loadUser({ query } = db) {
  return async (req, res, next) => {
    try {
      const match = req.path.match(/^\/u\/(\d+)/);
      const fromQuery = /^\d+$/.test(req.query.u || '') ? req.query.u : undefined;
      const userId = match ? match[1] : fromQuery;
      res.locals.user = userId
        ? (await query('SELECT id, name, avatar_url, avatar_data IS NOT NULL AS has_upload FROM users WHERE id = $1', [userId])).rows[0] || null
        : null;
      res.locals.userId = userId || '';
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.path.startsWith('/admin') || req.path === '/admin/enter') return next();
  if (req.signedCookies.rdt_admin === SESSION) return next();
  res.redirect(`/admin/enter${req.query.u ? `?u=${encodeURIComponent(req.query.u)}` : ''}`);
}

module.exports = { SESSION, requireAccess, loadUser, requireAdmin };
