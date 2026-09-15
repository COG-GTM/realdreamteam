// Simulator scheduler (docs/simulation-design.md §3). Runs inside the app
// process next to the poller: sleeps while nobody is on the site, runs one
// action per jittered tick while someone is. A Postgres advisory lock around
// each tick keeps it single-runner if two processes overlap (deploys).
const { pool } = require('../../db/db');
const presence = require('./presence');
const { makeRng } = require('./rng');
const { runTick } = require('./director');

const LOCK_ID = 20260916;
const HOURLY_CAP = 300;

const envSeconds = (name, fallback) => Number(process.env[name] || fallback);
const MIN_S = () => envSeconds('SIM_MIN_SECONDS', 5);
const MAX_S = () => envSeconds('SIM_MAX_SECONDS', 30);
const IDLE_S = () => envSeconds('SIM_IDLE_SECONDS', 90);
const IDLE_CHECK_S = () => envSeconds('SIM_IDLE_CHECK_SECONDS', 30);

const rng = makeRng((Date.now() & 0x7fffffff) || 1);
let enabled = process.env.SIM_ENABLED !== 'false';
let running = false;
let timer = null;
let awake = false;
let nextTickAt = null;
const lastActions = []; // ring buffer, newest first, max 10
const actionTimes = []; // executed-action timestamps for the hourly cap

function sleep(ms) {
  return new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

function remember(result) {
  lastActions.unshift({ at: new Date().toISOString(), ...result });
  if (lastActions.length > 10) lastActions.pop();
}

function actionsLastHour(now = Date.now()) {
  while (actionTimes.length && now - actionTimes[0] > 3600 * 1000) actionTimes.shift();
  return actionTimes.length;
}

async function doTick(log = console.log) {
  if (actionsLastHour() >= HOURLY_CAP) {
    const result = { action: 'throttled', skipped: '300 actions/hour ceiling' };
    remember(result);
    return result;
  }
  const client = await pool.connect();
  let result;
  try {
    const locked = (await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID])).rows[0].ok;
    if (!locked) {
      result = { action: 'skipped', skipped: 'another process holds the sim lock' };
    } else {
      result = await runTick({ rng, now: new Date(), presence, log });
      if (!result.skipped) actionTimes.push(Date.now());
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
  remember(result);
  return result;
}

const jitter = (min, max) => (min + Math.random() * (max - min)) * 1000;

async function safeTick() {
  try {
    await doTick();
  } catch (error) {
    console.error(`[sim] ${error.message}`);
  }
}

async function loop() {
  while (running) {
    const active = enabled && presence.anyoneActive(IDLE_S() * 1000);
    if (!active) {
      awake = false;
      nextTickAt = Date.now() + IDLE_CHECK_S() * 1000;
      await sleep(IDLE_CHECK_S() * 1000);
      continue;
    }
    const waking = !awake;
    awake = true;
    if (waking) {
      // Wake-up burst: the site would look frozen otherwise (§4).
      const burst = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < burst && running; i += 1) {
        await safeTick();
        const wait = jitter(2, 5);
        nextTickAt = Date.now() + wait;
        await sleep(wait);
      }
      continue;
    }
    await safeTick();
    const wait = jitter(MIN_S(), MAX_S());
    nextTickAt = Date.now() + wait;
    await sleep(wait);
  }
}

function start() {
  if (running) return;
  running = true;
  // A tick throwing would escape loop() and kill the simulator; restart it.
  loop().catch((error) => console.error('[sim]', error.message)).then(() => {
    const wasRunning = running;
    running = false;
    if (wasRunning) setTimeout(start, 30 * 1000).unref();
  });
}

function stop() {
  running = false;
  if (timer) clearTimeout(timer);
}

function setEnabled(value) {
  enabled = Boolean(value);
}

// Admin "run one action now": ignores presence, honours the lock and the cap.
function runNow(log = console.log) {
  return doTick(log);
}

function status() {
  return {
    enabled,
    awake: enabled && presence.anyoneActive(IDLE_S() * 1000),
    humansOnline: presence.activeHumanIds(IDLE_S() * 1000),
    awakeUntil: presence.awakeUntil() || null,
    lastActions: [...lastActions],
    actionsLastHour: actionsLastHour(),
    nextTickAt
  };
}

module.exports = { start, stop, status, runNow, setEnabled };
