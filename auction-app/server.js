require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { getUser } = require('./db/db');
const { start } = require('./lib/poller');
const routes = require('./routes');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  const match = req.path.match(/^\/u\/(\d+)/);
  const id = match ? match[1] : req.query.u;
  res.locals.user = id ? getUser(id) : null;
  res.locals.userId = id || '';
  res.locals.formatMoney = (amount, currency = 'USD') => new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(amount);
  next();
});
app.use(routes);

const port = Number(process.env.PORT || 3000);
start(require('./db/db').db);
if (require.main === module) app.listen(port, () => console.log(`Auction app listening on ${port}`));

module.exports = app;
