require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { init } = require('./db/db');
const createRouter = require('./routes/index');
const { createAccessGate } = require('./lib/accessGate');
const { startPoller } = require('./lib/poller');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(createAccessGate());
app.use('/', createRouter());

const port = Number.parseInt(process.env.PORT, 10) || 3000;

async function start() {
  try {
    await init();
    startPoller();
    app.listen(port, () => {
      console.log(`Auction app listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Unable to initialize auction app:', error);
    process.exitCode = 1;
  }
}

start();
