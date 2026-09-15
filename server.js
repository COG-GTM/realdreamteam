require('dotenv').config({ override: true });

if (process.env.NODE_ENV === 'production') {
  const missing = ['COOKIE_SECRET', 'ACCESS_CODE', 'ADMIN_CODE']
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
}

const path = require('node:path');
const querystring = require('node:querystring');
const express = require('express');
const cookieParser = require('cookie-parser');
const { seedIfEmpty } = require('./db/db');
const routes = require('./routes');
const { renderPage } = require('./routes/helpers');
const { start } = require('./lib/poller');
const { gateCookieOptions } = require('./lib/cookies');
const { gateLimiter } = require('./lib/rate-limit');
const { SESSION, requireAccess, loadUser, requireAdmin } = require('./lib/gates');

const app = express();
app.set('trust proxy', 1);
// Repeated keys (?u=1&u=1) keep their first value instead of becoming arrays.
app.set('query parser', (text) => {
  const parsed = querystring.parse(text);
  for (const key of Object.keys(parsed)) {
    if (Array.isArray(parsed[key])) parsed[key] = parsed[key][0];
  }
  return parsed;
});
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
  res.cookie('rdt_access', SESSION, gateCookieOptions());
  res.redirect('/');
});

app.post('/signout', (req, res) => {
  res.clearCookie('rdt_access');
  res.clearCookie('rdt_admin');
  res.redirect('/enter');
});

app.use(requireAccess);
app.use(loadUser());
app.use(requireAdmin);

app.use(routes);

app.use((req, res) => {
  res.status(404);
  renderPage(res, 'Not found', 'error', {
    status: 404,
    message: 'There is nothing at this address. It may have been withdrawn from sale.'
  });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500);
  renderPage(res, 'Something went wrong', 'error', {
    status: 500,
    message: 'The sale room hit an unexpected error. Please try again in a moment.'
  });
});

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
