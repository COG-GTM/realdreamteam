// The simulator's brain: one action per tick, chosen and executed through the
// same seams humans use (placeBid, favorites insert + logActivity). All
// decisions go through lib/sim/shadow.js pure functions and an injected rng.
const { query, withTransaction } = require('../../db/db');
const { placeBid } = require('../bids');
const { addFavorite } = require('../favorites');
const { chooseBidAmount, weightForLot, fairness, chooseAction } = require('./shadow');
const { calendarCheck } = require('./recycle');

const IDLE_MS = () => Number(process.env.SIM_IDLE_SECONDS || 90) * 1000;

// Fairness bookkeeping: when each human was last outbid by a shadow (§6.3).
const lastShadowOutbid = new Map(); // humanId -> epoch ms

const OPEN_LOTS_SQL = `
  SELECT l.id, l.title, l.artist, l.category, l.description, l.currency,
         l.starting_bid, l.estimate_low, l.estimate_high,
         a.id AS auction_id, a.starts_at, a.closes_at,
         hb.user_id AS high_bidder_id, hb.shadow AS high_bidder_shadow,
         hb.name AS high_bidder_name, hb.amount AS high_bid,
         (SELECT COUNT(*)::int FROM bids b WHERE b.lot_id = l.id) AS bid_count,
         (SELECT COUNT(*)::int FROM bids b WHERE b.lot_id = l.id
           AND b.placed_at > now() - interval '1 hour') AS bids_last_hour
  FROM lots l
  JOIN auctions a ON a.id = l.auction_id AND a.status = 'open'
  LEFT JOIN LATERAL (
    SELECT b.user_id, u.shadow, u.name, b.amount
    FROM bids b JOIN users u ON u.id = b.user_id
    WHERE b.lot_id = l.id
    ORDER BY b.amount DESC, b.placed_at ASC, b.id ASC
    LIMIT 1
  ) hb ON true`;

async function loadContext() {
  const [lotsResult, shadowsResult] = await Promise.all([
    query(OPEN_LOTS_SQL),
    query(
      `SELECT u.id, u.name, u.persona,
              COALESCE(p.categories, '{}') AS categories,
              COALESCE(p.artists, '{}') AS artists,
              COALESCE(p.keywords, '{}') AS keywords
       FROM users u LEFT JOIN preferences p ON p.user_id = u.id
       WHERE u.shadow = true AND u.banned = false`
    )
  ]);
  const lots = lotsResult.rows;
  const maxBidsLastHour = Math.max(0, ...lots.map((lot) => lot.bids_last_hour));
  for (const lot of lots) lot.max_bids_last_hour = maxBidsLastHour;
  return { lots, shadows: shadowsResult.rows };
}

// Lot ids an online human is high bidder on or has favorited (§6.3, weight 35).
async function humanTargetLots(lots, humanIds) {
  const targets = new Set();
  const humans = new Set(humanIds.map(Number));
  for (const lot of lots) {
    if (lot.high_bidder_id != null && humans.has(Number(lot.high_bidder_id)) && !lot.high_bidder_shadow) {
      targets.add(Number(lot.id));
    }
  }
  if (humanIds.length) {
    const favorited = await query(
      'SELECT DISTINCT lot_id FROM favorites WHERE user_id = ANY($1::bigint[])',
      [humanIds]
    );
    for (const row of favorited.rows) targets.add(Number(row.lot_id));
  }
  return targets;
}

function pickShadow(shadows, rng) {
  return rng.weighted(shadows.map((user) => ({
    weight: Math.max(0.05, Number(user.persona && user.persona.activity) || 0.5),
    value: user
  })));
}

function personaPrefs(user) {
  return { categories: user.categories, artists: user.artists, keywords: user.keywords };
}

function pickLotFor(shadow, ctx, rng) {
  const entries = [];
  for (const lot of ctx.lots) {
    if (lot.high_bidder_id != null && Number(lot.high_bidder_id) === Number(shadow.id)) continue;
    const weight = weightForLot(lot, { ...ctx, preferences: personaPrefs(shadow), persona: shadow.persona }, rng);
    if (weight <= 0) continue;
    if (lot.high_bidder_id != null && !lot.high_bidder_shadow) {
      const ok = fairness({
        humanHighBidderId: lot.high_bidder_id,
        closesAt: lot.closes_at,
        lastShadowOutbidAtForHuman: lastShadowOutbid.get(Number(lot.high_bidder_id))
      }, ctx.now);
      if (!ok) continue;
    }
    entries.push({ weight, value: lot });
  }
  return rng.weighted(entries);
}

function bidOnLot(shadow, lot, ctx, rng, log) {
  const amount = chooseBidAmount({
    highBid: lot.high_bid == null ? null : Number(lot.high_bid),
    startingBid: lot.starting_bid == null ? null : Number(lot.starting_bid),
    estimateLow: lot.estimate_low == null ? null : Number(lot.estimate_low),
    estimateHigh: lot.estimate_high == null ? null : Number(lot.estimate_high),
    persona: shadow.persona
  }, rng);
  if (amount == null) return { action: 'bid', userName: shadow.name, lotId: lot.id, skipped: 'over persona budget' };
  return placeBid({ userId: shadow.id, lotId: lot.id, amount: String(amount) }).then((result) => {
    if (!result.ok) return { action: 'bid', userName: shadow.name, lotId: lot.id, skipped: result.error };
    if (lot.high_bidder_id != null && !lot.high_bidder_shadow) {
      lastShadowOutbid.set(Number(lot.high_bidder_id), ctx.now.getTime());
    }
    log(`[sim] ${shadow.name} bid ${result.amount} on lot ${lot.id} ("${lot.title}")${lot.high_bidder_name ? ` — outbid ${lot.high_bidder_name}` : ''}`);
    return { action: 'bid', userName: shadow.name, lotId: lot.id, amount: result.amount };
  });
}

async function actBid(shadow, ctx, rng, log) {
  const lot = pickLotFor(shadow, ctx, rng);
  if (!lot) return { action: 'bid', userName: shadow.name, skipped: 'no eligible lot' };
  return bidOnLot(shadow, lot, ctx, rng, log);
}

async function actFavorite(shadow, ctx, rng, log) {
  const lot = pickLotFor(shadow, ctx, rng);
  if (!lot) return { action: 'favorite', userName: shadow.name, skipped: 'no eligible lot' };
  const added = await withTransaction((client) => addFavorite(client, { userId: shadow.id, lotId: lot.id }));
  if (!added) return { action: 'favorite', userName: shadow.name, lotId: lot.id, skipped: 'already favorited' };
  log(`[sim] ${shadow.name} favorited lot ${lot.id} ("${lot.title}")`);
  return { action: 'favorite', userName: shadow.name, lotId: lot.id };
}

// A shadow who bid on an open lot and was then outbid within the last 30 min,
// gated by its aggression persona — produces visible bidding wars.
async function actRespondOutbid(ctx, rng, log) {
  const beaten = await query(
    `SELECT DISTINCT l.id AS lot_id, u.id AS shadow_id
     FROM lots l
     JOIN auctions a ON a.id = l.auction_id AND a.status = 'open'
     JOIN users u ON u.shadow = true AND u.banned = false
     WHERE EXISTS (
       SELECT 1 FROM bids mine WHERE mine.lot_id = l.id AND mine.user_id = u.id)
       AND EXISTS (
         SELECT 1 FROM bids newer
         WHERE newer.lot_id = l.id AND newer.user_id <> u.id
           AND newer.placed_at > now() - interval '30 minutes'
           AND newer.amount > COALESCE((
             SELECT MAX(m2.amount) FROM bids m2
             WHERE m2.lot_id = l.id AND m2.user_id = u.id AND m2.placed_at < newer.placed_at
           ), 0))
       AND u.id <> COALESCE((
         SELECT b2.user_id FROM bids b2 WHERE b2.lot_id = l.id
         ORDER BY b2.amount DESC, b2.placed_at ASC, b2.id ASC LIMIT 1), -1)
     ORDER BY l.id`
  );
  if (!beaten.rows.length) return { action: 'respond_outbid', skipped: 'nobody beaten' };
  const row = rng.pick(beaten.rows);
  const shadow = ctx.shadows.find((user) => Number(user.id) === Number(row.shadow_id));
  const lot = ctx.lots.find((candidate) => Number(candidate.id) === Number(row.lot_id));
  if (!shadow || !lot) return { action: 'respond_outbid', skipped: 'no takers' };
  const aggression = Number(shadow.persona && shadow.persona.aggression) || 0;
  if (rng.float() >= aggression) return { action: 'respond_outbid', userName: shadow.name, lotId: lot.id, skipped: 'walked away' };
  if (lot.high_bidder_id != null && !lot.high_bidder_shadow) {
    const ok = fairness({
      humanHighBidderId: lot.high_bidder_id,
      closesAt: lot.closes_at,
      lastShadowOutbidAtForHuman: lastShadowOutbid.get(Number(lot.high_bidder_id))
    }, ctx.now);
    if (!ok) return { action: 'respond_outbid', userName: shadow.name, lotId: lot.id, skipped: 'fairness' };
  }
  const result = await bidOnLot(shadow, lot, ctx, rng, log);
  return { ...result, action: 'respond_outbid' };
}

// One action. Returns {action, userName?, lotId?, amount?, skipped?}.
async function runTick({ rng, now = new Date(), presence, log = console.log }) {
  const calendar = await calendarCheck({ now, rng, log });
  if (calendar) return calendar;

  const ctx = await loadContext();
  ctx.now = now;
  if (!ctx.shadows.length) return { action: 'setup', skipped: 'no shadow users' };
  if (!ctx.lots.length) return { action: 'setup', skipped: 'no open lots' };

  const humanIds = presence ? presence.activeHumanIds(IDLE_MS(), now.getTime()) : [];
  ctx.humanTargetLotIds = await humanTargetLots(ctx.lots, humanIds);

  const action = chooseAction(rng);
  if (action === 'nothing') return { action, skipped: 'quiet moment' };
  const shadow = pickShadow(ctx.shadows, rng);
  if (action === 'favorite') return actFavorite(shadow, ctx, rng, log);
  if (action === 'respond_outbid') return actRespondOutbid(ctx, rng, log);
  return actBid(shadow, ctx, rng, log);
}

function resetDirector() {
  lastShadowOutbid.clear();
}

module.exports = { runTick, resetDirector };
