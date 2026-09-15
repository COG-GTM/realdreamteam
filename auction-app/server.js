require('dotenv').config({ override: true });

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { query, seedIfEmpty } = require('./db/db');
const routes = require('./routes');
const { renderPage } = require('./routes/helpers');
const { start } = require('./lib/poller');

const app = express();
const cookieSecret = process.env.COOKIE_SECRET || 'auction-interest-demo';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser(cookieSecret));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/enter', (req, res) => {
  renderPage(res, 'Access', 'enter', {
    admin: false,
    hint: "Your favorite otter's birthday in ISO 8601 basic format…"
  });
});

app.post('/enter', (req, res) => {
  const expected = process.env.ACCESS_CODE || '20240312';
  if (String(req.body.code || '') !== expected) {
    return renderPage(res, 'Access', 'enter', {
      admin: false,
      error: 'That code did not match.',
      hint: "Your favorite otter's birthday in ISO 8601 basic format…"
    });
  }
  res.cookie('rdt_access', '1', {
    signed: true,
    httpOnly: true
  });
  res.redirect('/');
});

app.use((req, res, next) => {
  if (req.signedCookies.rdt_access === '1') return next();
  res.redirect('/enter');
});

app.use(async (req, res, next) => {
  try {
    const match = req.path.match(/^\/u\/(\d+)/);
    const userId = match ? match[1] : req.query.u;
    res.locals.user = userId
      ? (await query('SELECT id, name, avatar_url FROM users WHERE id = $1', [userId])).rows[0] || null
      : null;
    res.locals.userId = userId || '';
    next();
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/admin') || req.path === '/admin/enter') return next();
  if (req.signedCookies.rdt_admin === '1') return next();
  res.redirect('/admin/enter');
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
