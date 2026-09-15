// Express middleware for the two cookie gates (site code, admin code) and the
// per-request user lookup. Wired up in server.js.
const db = require('../db/db');

const SESSION = 'session';

function requireAccess(req, res, next) {
  if (req.signedCookies.rdt_access === SESSION) return next();
  res.redirect('/enter');
}

// Pages that render without a user: the picker, avatar images, the admin area
// (gated by its own code) and the sidebar pane partials.
function userOptional(path) {
  return path === '/' || path.startsWith('/avatars/') || path.startsWith('/admin') || path.startsWith('/panes/');
}

// Loads the current user; everywhere else redirects to the picker without one.
function loadUser({ query } = db) {
  return async (req, res, next) => {
    try {
      const match = req.path.match(/^\/u\/(\d+)/);
      const candidates = [
        match && match[1],
        req.query && req.query.u,
        req.body && req.body.u
      ];
      const userId = candidates.find((value) => /^\d+$/.test(String(value || '')));
      const optional = userOptional(req.path);
      res.locals.user = null;
      res.locals.userId = '';
      if (!userId) return optional ? next() : res.redirect('/');
      const user = (await query(
        'SELECT id, name, avatar_url, avatar_data IS NOT NULL AS has_upload FROM users WHERE id = $1',
        [userId]
      )).rows[0];
      if (!user) return optional ? next() : res.redirect('/');
      res.locals.user = user;
      res.locals.userId = userId;
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
