require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { db, seedIfEmpty } = require('./db/db');
const createRouter = require('./routes/index');
const { startPoller } = require('./lib/poller');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', createRouter(db));

seedIfEmpty();
startPoller(db);

const port = Number.parseInt(process.env.PORT, 10) || 3000;
app.listen(port, () => {
  console.log(`Auction app listening on http://localhost:${port}`);
});
