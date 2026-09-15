const { seedIfEmpty } = require('../db/db');

async function runOnce() {
  await seedIfEmpty();
}

function start() {
  const seconds = Number(process.env.POLL_SECONDS || 5);
  const timer = setInterval(() => runOnce().catch((error) => console.error('[poller]', error.message)), seconds * 1000);
  timer.unref();
  return timer;
}

module.exports = { start, runOnce };
