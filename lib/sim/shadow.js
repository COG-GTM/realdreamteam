// Pure shadow-bidder decisions (docs/simulation-design.md §6). Everything here
// takes an injected rng so tests are deterministic; database access lives in
// director.js.
const { nextBid, maxBid, bidIncrement } = require('../bids');
const { matchLot } = require('../matching');

const HOUR = 60 * 60 * 1000;
const ACTION_WEIGHTS = [
  { weight: 60, value: 'bid' },
  { weight: 15, value: 'favorite' },
  { weight: 10, value: 'respond_outbid' },
  { weight: 5, value: 'nothing' }
];

// §6.2: minimum 70% of the time, one extra increment 25%, a "statement" jump
// (within maxBid's cap) 5%. Never above estimate_high × persona.budget.
function chooseBidAmount({ highBid, startingBid, estimateLow, estimateHigh, persona }, rng) {
  const info = { highBid, startingBid, estimateLow };
  const min = nextBid(info);
  if (min == null) return null;
  const increment = bidIncrement(highBid ?? startingBid ?? estimateLow ?? 0);
  const roll = rng.float();
  let amount = min;
  if (roll >= 0.95) {
    amount = Math.min(maxBid(info), min + increment * rng.int(2, 5));
  } else if (roll >= 0.70) {
    amount = min + increment;
  }
  const budget = persona && persona.budget != null ? Number(persona.budget) : 1;
  if (estimateHigh != null && amount > Number(estimateHigh) * budget) return null;
  return amount;
}

// Fraction of the auction's life elapsed... 1 - timeLeft/duration in [0, 1],
// or null when the auction has no closes_at (or bogus times).
function elapsedFraction(lot, now) {
  if (!lot.starts_at || !lot.closes_at) return null;
  const duration = new Date(lot.closes_at) - new Date(lot.starts_at);
  if (duration <= 0) return null;
  const timeLeft = new Date(lot.closes_at) - now;
  return Math.min(1, Math.max(0, 1 - timeLeft / duration));
}

// §6.3 lot-selection weight. lot fields: id, bid_count, bids_last_hour,
// max_bids_last_hour (across candidates), starts_at, closes_at plus the
// matching fields (title/artist/category/description). ctx: {persona,
// preferences, humanTargetLotIds:Set, now}. Returns 0 = never picked.
function weightForLot(lot, ctx, rng) {
  const now = ctx.now || new Date();
  const fraction = elapsedFraction(lot, now);

  // Snipers only act in the last 10% of an auction's life; with no closes_at
  // there is no "last 10%", so a sniper never picks such lots.
  if (ctx.persona && ctx.persona.sniper && (fraction == null || fraction < 0.9)) return 0;

  let weight = 0;
  if (ctx.humanTargetLotIds && ctx.humanTargetLotIds.has(Number(lot.id))) weight += 35;
  if (ctx.preferences && matchLot(lot, ctx.preferences).matched) weight += 25;
  if (lot.closes_at && new Date(lot.closes_at) - now <= 2 * HOUR && new Date(lot.closes_at) > now) weight += 20;
  if (lot.bids_last_hour > 0 && lot.bids_last_hour === lot.max_bids_last_hour) weight += 15;
  if (Number(lot.bid_count) === 0) weight += 5;
  if (weight === 0) return 0;

  // Ending-soon heat: 1 + 3·elapsed² — flat early, sharp at the end.
  const multiplier = fraction == null ? 1 : 1 + 3 * fraction * fraction;
  return weight * multiplier;
}

// §6.3 fairness: a shadow never outbids a human in the last 15 minutes before
// close, and at most once per human per 10 minutes. Everything else is fair.
function fairness({ humanHighBidderId, closesAt, lastShadowOutbidAtForHuman }, now = new Date()) {
  if (humanHighBidderId == null) return true;
  if (closesAt && new Date(closesAt) - now <= 15 * 60 * 1000) return false;
  if (lastShadowOutbidAtForHuman && now - lastShadowOutbidAtForHuman < 10 * 60 * 1000) return false;
  return true;
}

function chooseAction(rng) {
  return rng.weighted(ACTION_WEIGHTS);
}

module.exports = { chooseBidAmount, weightForLot, fairness, chooseAction, elapsedFraction, ACTION_WEIGHTS };
