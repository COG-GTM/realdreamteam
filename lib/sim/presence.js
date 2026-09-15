// In-memory presence: "is anyone using the site right now?" Every open tab
// polls /panes/* every 3 s, and routes/panes.js calls touch() on each poll —
// that is the heartbeat. Nothing is persisted; a restart just means the
// simulator goes back to sleep until someone shows up.
const seen = new Map(); // numeric user id, or 'anon' -> last seen epoch ms
let forcedUntil = 0;

const ANON = 'anon';

function key(userId) {
  return userId == null || userId === '' ? ANON : Number(userId);
}

function touch(userId, now = Date.now()) {
  seen.set(key(userId), now);
}

// idleMs: how long without a heartbeat counts as "gone" (SIM_IDLE_SECONDS).
function anyoneActive(idleMs, now = Date.now()) {
  if (now < forcedUntil) return true;
  for (const at of seen.values()) {
    if (now - at < idleMs) return true;
  }
  return false;
}

// Numeric ids of real users seen within the window ('anon' is not a person).
function activeHumanIds(idleMs, now = Date.now()) {
  const ids = [];
  for (const [id, at] of seen) {
    if (id !== ANON && now - at < idleMs) ids.push(id);
  }
  return ids;
}

// Admin "Wake for 10 min": pretend someone is here until then.
function forceAwakeUntil(ms) {
  forcedUntil = ms;
}

function awakeUntil() {
  return forcedUntil;
}

function reset() {
  seen.clear();
  forcedUntil = 0;
}

module.exports = { touch, anyoneActive, activeHumanIds, forceAwakeUntil, awakeUntil, reset };
