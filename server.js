require('dotenv').config({ override: true });

if (process.env.NODE_ENV === 'production') {
  const missing = ['COOKIE_SECRET', 'ACCESS_CODE', 'ADMIN_CODE']
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
}

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { query, seedIfEmpty } = require('./db/db');
const routes = require('./routes');
const { renderPage } = require('./routes/helpers');
const { start } = require('./lib/poller');
const { gateCookieOptions } = require('./lib/cookies');
const { gateLimiter } = require('./lib/rate-limit');

const app = express();
app.set('trust proxy', 1);
const cookieSecret = process.env.COOKIE_SECRET || 'auction-interest-demo';
const accessLimiter = gateLimiter();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser(cookieSecret));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/enter', (req, res) => {
  renderPage(res, 'Access', 'enter', {
    gate: true,
    admin: false,
    hint: "Your favorite otter's birthday in ISO 8601 basic format…"
  });
});

app.post('/enter', accessLimiter, (req, res) => {
  if (req.rateLimited) {
    res.status(429);
    return renderPage(res, 'Access', 'enter', {
      gate: true,
      admin: false,
      error: 'Too many attempts. Try again in a few minutes.',
      hint: "Your favorite otter's birthday in ISO 8601 basic format…"
    });
  }
  const expected = process.env.ACCESS_CODE || '20240312';
  if (String(req.body.code || '') !== expected) {
    accessLimiter.recordFailure(req);
    return renderPage(res, 'Access', 'enter', {
      gate: true,
      admin: false,
      error: 'That code did not match.',
      hint: "Your favorite otter's birthday in ISO 8601 basic format…"
    });
  }
  res.cookie('rdt_access', 'session', gateCookieOptions());
  res.redirect('/');
});

app.post('/signout', (req, res) => {
  res.clearCookie('rdt_access');
  res.clearCookie('rdt_admin');
  res.redirect('/enter');
});

app.use((req, res, next) => {
  if (req.signedCookies.rdt_access === 'session') return next();
  res.redirect('/enter');
});

app.use(async (req, res, next) => {
  try {
    const match = req.path.match(/^\/u\/(\d+)/);
    const userId = match ? match[1] : req.query.u;
    res.locals.user = userId
      ? (await query('SELECT id, name, avatar_url, avatar_data IS NOT NULL AS has_upload FROM users WHERE id = $1', [userId])).rows[0] || null
      : null;
    res.locals.userId = userId || '';
    next();
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/admin') || req.path === '/admin/enter') return next();
  if (req.signedCookies.rdt_admin === 'session') return next();
  res.redirect(`/admin/enter${req.query.u ? `?u=${encodeURIComponent(req.query.u)}` : ''}`);
});

app.use(routes);

async function boot() {
  await seedIfEmpty();
  start();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Auction app listening on ${port}`));
}

if (require.main === module) {
  boot().catch((error) => {
    console.error(`Auction app failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
