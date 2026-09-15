// The recycler keeps the calendar alive forever (docs/simulation-design.md
// §5): clone closed auctions forward, re-offer their unsold lots plus a few
// bank lots, keep enough upcoming/open sales around, and prune ancient
// history so the database stays small.
const { query, withTransaction, seedFiles } = require('../../db/db');
const { logActivity } = require('../activity');

const MINUTES = 60 * 1000;
const DAY = 24 * 60 * MINUTES;
const CLEANUP_AGE_DAYS = 90;
const CLEANUP_EVERY_MS = DAY; // once per process-day

const MIN_OPEN = () => Number(process.env.SIM_MIN_OPEN_AUCTIONS || 3);
const MIN_UPCOMING = () => Number(process.env.SIM_MIN_UPCOMING_AUCTIONS || 1);

let lastCleanupAt = 0;

// "L26021" -> "L26021-S2", then "L26021-S3" for the next clone. The bare ref
// counts as season 1. Pure; unit-tested.
function nextHouseRef(houseRef, existing = []) {
  const base = String(houseRef || 'sale').replace(/-S\d+$/i, '');
  let max = 1;
  for (const ref of existing) {
    const match = /-S(\d+)$/i.exec(String(ref));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base}-S${max + 1}`;
}

// Estimate drift ±10%, coarsely rounded (nearest 10 above 1000). Pure.
function driftEstimate(value, factor) {
  if (value == null) return null;
  const drifted = Number(value) * factor;
  const rounded = drifted >= 1000 ? Math.round(drifted / 10) * 10 : Math.round(drifted);
  return Math.max(rounded, 1);
}

// ~30% of the sold lots come back ("from a private collection"). Pure.
function selectSoldLots(soldLots, rng) {
  return soldLots.filter(() => rng.float() < 0.3);
}

// §5.1: the bank is data/seed/lots.json minus anything an open/upcoming
// auction currently offers (matched on source_url), longest-unseen first.
function pickBankLots(bankLots, liveSourceUrls, lastSeenByUrl, count) {
  return bankLots
    .filter((lot) => lot.source_url && !liveSourceUrls.has(lot.source_url))
    .sort((a, b) => (lastSeenByUrl.get(a.source_url) || 0) - (lastSeenByUrl.get(b.source_url) || 0))
    .slice(0, count);
}

async function pickSource(client) {
  const uncloned = (await client.query(
    `SELECT a.* FROM auctions a
     WHERE a.status = 'closed'
       AND NOT EXISTS (SELECT 1 FROM auctions c WHERE c.cloned_from_auction_id = a.id)
     ORDER BY a.closes_at ASC, a.id ASC
     LIMIT 1 FOR UPDATE OF a`
  )).rows[0];
  if (uncloned) return uncloned;
  // Every closed auction already has a clone: clone the oldest whose newest
  // clone is itself closed (the lineage has a closed tip).
  return (await client.query(
    `SELECT a.* FROM auctions a
     WHERE a.status = 'closed'
       AND EXISTS (SELECT 1 FROM auctions c WHERE c.cloned_from_auction_id = a.id)
       AND NOT EXISTS (
         SELECT 1 FROM auctions c
         WHERE c.cloned_from_auction_id = a.id AND c.status IN ('upcoming', 'open'))
     ORDER BY a.closes_at ASC, a.id ASC
     LIMIT 1 FOR UPDATE OF a`
  )).rows[0];
}

// One transaction: new upcoming auction cloned forward from `source`, its
// unsold lots + ~30% of sold lots + 2–5 bank lots re-offered.
async function cloneForward(rng, { now = new Date(), log = console.log } = {}) {
  return withTransaction(async (client) => {
    const source = await pickSource(client);
    if (!source) return { skipped: 'nothing to clone' };

    const siblings = (await client.query(
      `SELECT house_ref FROM auctions
       WHERE auction_house_id = $1 AND (house_ref = $2 OR house_ref LIKE $2 || '-S%')`,
      [source.auction_house_id, String(source.house_ref || 'sale').replace(/-S\d+$/i, '')]
    )).rows.map((row) => row.house_ref);

    const startsAt = new Date(now.getTime() + rng.int(10, 120) * MINUTES);
    const closesAt = new Date(startsAt.getTime() + rng.int(1, 5) * DAY);
    const clone = (await client.query(
      `INSERT INTO auctions
       (auction_house_id, house_ref, title, location, format, status, starts_at, closes_at, source_url, cloned_from_auction_id)
       VALUES ($1, $2, $3, $4, 'timed', 'upcoming', $5, $6, $7, $8)
       RETURNING *`,
      [source.auction_house_id, nextHouseRef(source.house_ref, siblings), source.title,
        source.location, startsAt, closesAt, source.source_url, source.id]
    )).rows[0];

    const sourceLots = (await client.query(
      'SELECT * FROM lots WHERE auction_id = $1 ORDER BY lot_number, id',
      [source.id]
    )).rows;
    const reoffered = sourceLots.filter((lot) => lot.hammer_price == null)
      .concat(selectSoldLots(sourceLots.filter((lot) => lot.hammer_price != null), rng));

    // Bank lots: seed file minus source_urls currently offered, longest-unseen first.
    const bank = (await availableBankLots(client)).slice(0, rng.int(2, 5));

    const insertLot = async (lot, lotNumber, reofferedFrom) => {
      const factor = 0.9 + rng.float() * 0.2;
      let low = driftEstimate(lot.estimate_low, factor);
      let high = driftEstimate(lot.estimate_high, factor);
      if (low != null && high != null && low > high) [low, high] = [high, low];
      const starting = driftEstimate(low, 0.7);
      const inserted = (await client.query(
        `INSERT INTO lots
         (auction_id, lot_number, title, artist, category, description, currency,
          estimate_low, estimate_high, starting_bid, source_url, reoffered_from_lot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [clone.id, lotNumber, lot.title, lot.artist || null, lot.category, lot.description || null,
          lot.currency || 'USD', low, high, starting ?? (lot.starting_bid ?? null),
          lot.source_url || null, reofferedFrom]
      )).rows[0].id;
      for (const [index, image] of (lot.images || []).entries()) {
        await client.query(
          'INSERT INTO lot_images (lot_id, position, url, credit) VALUES ($1, $2, $3, $4)',
          [inserted, index + 1, image.url, image.credit || null]
        );
      }
      return inserted;
    };

    let lotNumber = 0;
    for (const lot of reoffered) {
      lotNumber += 1;
      // Images for source lots live in lot_images, not on the row.
      const images = (await client.query(
        'SELECT url, credit FROM lot_images WHERE lot_id = $1 ORDER BY position', [lot.id]
      )).rows;
      await insertLot({ ...lot, images }, lotNumber, lot.id);
    }
    for (const lot of bank) {
      lotNumber += 1;
      const prior = (await client.query(
        'SELECT id FROM lots WHERE source_url = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [lot.source_url]
      )).rows[0];
      await insertLot(lot, lotNumber, prior ? prior.id : null);
    }

    await logActivity(client, {
      kind: 'reoffered',
      auctionId: clone.id,
      detail: `${lotNumber} lots, from ${source.title}`
    });
    log(`[sim] cloned "${source.title}" forward as "${clone.house_ref}" (${lotNumber} lots, opens in ${Math.round((startsAt - now) / MINUTES)} min)`);
    return { auctionId: clone.id, lotCount: lotNumber, sourceId: source.id };
  });
}

// Delete closed auctions older than 90 days — except the direct parent of a
// lineage tip, so a clone's "Previously offered" links keep working.
async function cleanup(log = console.log) {
  return withTransaction(async (client) => {
    const deletable = (await client.query(
      `SELECT a.id FROM auctions a
       WHERE a.status = 'closed' AND a.closes_at < now() - interval '90 days'
         AND NOT EXISTS (
           SELECT 1 FROM auctions c
           WHERE c.cloned_from_auction_id = a.id
             AND NOT EXISTS (SELECT 1 FROM auctions g WHERE g.cloned_from_auction_id = c.id))`
    )).rows.map((row) => row.id);
    if (!deletable.length) return { deleted: 0 };
    // Self-FKs don't cascade: detach the lineage pointers before deleting.
    await client.query(
      `UPDATE lots SET reoffered_from_lot_id = NULL
       WHERE reoffered_from_lot_id IN (SELECT id FROM lots WHERE auction_id = ANY($1::bigint[]))`,
      [deletable]
    );
    await client.query(
      'UPDATE auctions SET cloned_from_auction_id = NULL WHERE cloned_from_auction_id = ANY($1::bigint[])',
      [deletable]
    );
    const result = await client.query('DELETE FROM auctions WHERE id = ANY($1::bigint[])', [deletable]);
    log(`[sim] cleanup: deleted ${result.rowCount} auctions older than ${CLEANUP_AGE_DAYS} days`);
    return { deleted: result.rowCount };
  });
}

// Cheap calendar maintenance at the head of every tick. A clone counts as the
// tick's action; pull-forwards and closes_at assignment just happen.
async function calendarCheck({ now = new Date(), rng, log = console.log } = {}) {
  const counts = (await query(
    `SELECT
       (SELECT COUNT(*)::int FROM auctions WHERE status = 'open') AS open,
       (SELECT COUNT(*)::int FROM auctions WHERE status = 'upcoming') AS upcoming`
  )).rows[0];

  if (counts.upcoming < MIN_UPCOMING()) {
    const result = await cloneForward(rng, { now, log });
    if (result.skipped) return null;
    return { action: 'reoffered', auctionId: result.auctionId, lotCount: result.lotCount, sourceId: result.sourceId };
  }

  if (counts.open < MIN_OPEN()) {
    const next = (await query(
      `SELECT id, title, starts_at FROM auctions
       WHERE status = 'upcoming' ORDER BY starts_at ASC LIMIT 1`
    )).rows[0];
    if (next && new Date(next.starts_at) - now > 30 * MINUTES) {
      const pulled = new Date(now.getTime() + rng.int(1, 5) * MINUTES);
      await query(
        `UPDATE auctions SET starts_at = $2
         WHERE id = $1 AND (closes_at IS NULL OR closes_at > $2)`,
        [next.id, pulled]
      );
      log(`[sim] pulled "${next.title}" forward to ${pulled.toISOString()}`);
    }
  }

  const endless = await query(
    `SELECT id, title FROM auctions
     WHERE status = 'open' AND closes_at IS NULL AND starts_at < $1`,
    [new Date(now.getTime() - 7 * DAY)]
  );
  for (const auction of endless.rows) {
    const closesAt = new Date(now.getTime() + rng.int(1, 3) * DAY);
    await query('UPDATE auctions SET closes_at = $2 WHERE id = $1', [auction.id, closesAt]);
    log(`[sim] gave "${auction.title}" a closes_at ${closesAt.toISOString()}`);
  }

  if (now.getTime() - lastCleanupAt > CLEANUP_EVERY_MS) {
    lastCleanupAt = now.getTime();
    await cleanup(log);
  }

  return null;
}

function resetRecycler() {
  lastCleanupAt = 0;
}

// Bank lots currently safe to offer anywhere: seed file minus source_urls
// already on an open/upcoming auction, longest-unseen first. Shared by
// cloneForward and the publish_lot action.
async function availableBankLots(client) {
  const liveUrls = new Set((await client.query(
    `SELECT DISTINCT l.source_url FROM lots l
     JOIN auctions a ON a.id = l.auction_id
     WHERE a.status IN ('open', 'upcoming') AND l.source_url IS NOT NULL`
  )).rows.map((row) => row.source_url));
  const lastSeen = new Map((await client.query(
    `SELECT source_url, MAX(created_at) AS last_seen FROM lots
     WHERE source_url IS NOT NULL GROUP BY source_url`
  )).rows.map((row) => [row.source_url, new Date(row.last_seen).getTime()]));
  return pickBankLots(seedFiles().lots, liveUrls, lastSeen, Number.MAX_SAFE_INTEGER);
}

module.exports = { calendarCheck, cloneForward, cleanup, nextHouseRef, driftEstimate, selectSoldLots, pickBankLots, availableBankLots, resetRecycler };
