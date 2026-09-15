const { query, withTransaction } = require('../db/db');
const { notifyMatches } = require('./new-lot');

function normalizeName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) {
    const error = new Error('Category name is required.');
    error.status = 400;
    throw error;
  }
  return name;
}

function dedupeArray(arr) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : []).filter((value) => {
    const key = String(value).trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wordsFor(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter((word) => word.length >= 3);
}

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

async function category(client, id, lock = false) {
  const result = await client.query(`SELECT * FROM categories WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!result.rows[0]) throw bad('Category not found.');
  return result.rows[0];
}

async function updateReferences(client, oldName, newName) {
  await client.query(
    'UPDATE lots SET category = $2 WHERE lower(category) = lower($1)',
    [oldName, newName]
  );
  await client.query(
    `UPDATE preferences
     SET categories = array_replace(categories, $1, $2), updated_at = updated_at
     WHERE $1 = ANY(categories)`,
    [oldName, newName]
  );
  const preferences = (await client.query(
    'SELECT user_id, categories FROM preferences WHERE $1 = ANY(categories)',
    [newName]
  )).rows;
  for (const pref of preferences) {
    const categories = dedupeArray(pref.categories);
    await client.query('UPDATE preferences SET categories = $2 WHERE user_id = $1', [pref.user_id, categories]);
  }
}

async function addCategory(rawName) {
  const name = normalizeName(rawName);
  return withTransaction(async (client) => {
    const position = (await client.query('SELECT COALESCE(MAX(position), 0) + 1 AS position FROM categories')).rows[0].position;
    try {
      return (await client.query(
        'INSERT INTO categories (name, position) VALUES ($1, $2) RETURNING *',
        [name, position]
      )).rows[0];
    } catch (error) {
      if (error.code === '23505') throw bad(`Category "${name}" already exists.`);
      throw error;
    }
  });
}

async function renameCategory(id, rawName) {
  const name = normalizeName(rawName);
  return withTransaction(async (client) => {
    const old = await category(client, id, true);
    const collision = (await client.query(
      'SELECT id FROM categories WHERE lower(name) = lower($1) AND id <> $2',
      [name, id]
    )).rows[0];
    if (collision) throw bad(`Category "${name}" already exists.`);
    await client.query('UPDATE categories SET name = $2 WHERE id = $1', [id, name]);
    await updateReferences(client, old.name, name);
    return { ...old, name };
  });
}

async function moveCategory(id, direction) {
  return withTransaction(async (client) => {
    const current = await category(client, id, true);
    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (!delta) throw bad('Invalid move direction.');
    const neighbour = (await client.query(
      `SELECT * FROM categories
       WHERE id <> $1 AND position ${delta < 0 ? '<' : '>'} $2
       ORDER BY position ${delta < 0 ? 'DESC' : 'ASC'}, id ${delta < 0 ? 'DESC' : 'ASC'}
       LIMIT 1 FOR UPDATE`,
      [id, current.position]
    )).rows[0];
    if (!neighbour) return current;
    await client.query('UPDATE categories SET position = $2 WHERE id = $1', [current.id, neighbour.position]);
    await client.query('UPDATE categories SET position = $2 WHERE id = $1', [neighbour.id, current.position]);
    return { ...current, position: neighbour.position };
  });
}

async function countsFor(client, name) {
  const lots = (await client.query(
    'SELECT COUNT(*)::int AS count FROM lots WHERE lower(category) = lower($1)',
    [name]
  )).rows[0].count;
  const followers = (await client.query(
    'SELECT COUNT(*)::int AS count FROM preferences WHERE $1 = ANY(categories)',
    [name]
  )).rows[0].count;
  return { lots, followers };
}

async function deactivateCategory(id, { reassignTo } = {}) {
  return withTransaction(async (client) => {
    const current = await category(client, id, true);
    const counts = await countsFor(client, current.name);
    if ((counts.lots || counts.followers) && !reassignTo) {
      throw bad(`Choose where to move ${counts.lots} lots and ${counts.followers} followers before deactivating "${current.name}".`);
    }
    if (reassignTo) {
      const target = await category(client, reassignTo, true);
      if (target.id === current.id || !target.active) throw bad('Choose a different active category.');
      await updateReferences(client, current.name, target.name);
    }
    await client.query('UPDATE categories SET active = false WHERE id = $1', [id]);
    return { ...current, active: false, counts };
  });
}

async function reactivateCategory(id) {
  return withTransaction(async (client) => {
    await category(client, id, true);
    return (await client.query('UPDATE categories SET active = true WHERE id = $1 RETURNING *', [id])).rows[0];
  });
}

async function deleteCategory(id) {
  return withTransaction(async (client) => {
    const current = await category(client, id, true);
    const counts = await countsFor(client, current.name);
    if (counts.lots || counts.followers) throw bad(`Cannot delete "${current.name}" while it has lots or followers.`);
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
    return current;
  });
}

async function usageCounts(client = null) {
  const run = client ? (sql, params) => client.query(sql, params) : query;
  const result = await run(
    `SELECT c.name,
      (SELECT COUNT(*)::int FROM lots l WHERE lower(l.category) = lower(c.name)) AS lots,
      (SELECT COUNT(*)::int FROM preferences p WHERE c.name = ANY(p.categories)) AS followers
     FROM categories c`
  );
  return Object.fromEntries(result.rows.map((row) => [row.name, {
    lots: Number(row.lots),
    followers: Number(row.followers)
  }]));
}

async function candidateLots(categoryId) {
  return withTransaction(async (client) => {
    const target = await category(client, categoryId);
    const words = wordsFor(target.name);
    const patterns = words.map((word) => `%${word}%`);
    const rows = (await client.query(
      `SELECT l.id, l.lot_number, l.title, l.artist, l.category,
              a.title AS auction_title, a.starts_at
       FROM lots l JOIN auctions a ON a.id = l.auction_id
       WHERE a.status IN ('upcoming', 'open')
         AND lower(l.category) <> lower($1)
       ORDER BY a.starts_at, l.lot_number, l.id`,
      [target.name]
    )).rows;
    const suggested = words.length
      ? (await client.query(
        `SELECT l.id, l.lot_number, l.title, l.artist, l.category,
                a.title AS auction_title, a.starts_at
         FROM lots l JOIN auctions a ON a.id = l.auction_id
         WHERE a.status IN ('upcoming', 'open')
           AND lower(l.category) <> lower($1)
           AND (lower(l.title || ' ' || coalesce(l.description, '') || ' ' || coalesce(l.artist, '')) ILIKE ANY($2::text[]))
         ORDER BY a.starts_at, l.lot_number, l.id`,
        [target.name, patterns]
      )).rows
      : [];
    const suggestedIds = new Set(suggested.map((lot) => String(lot.id)));
    return {
      category: target,
      suggested,
      others: rows.filter((lot) => !suggestedIds.has(String(lot.id)))
    };
  });
}

async function moveLots(lotIds, categoryId) {
  const ids = (Array.isArray(lotIds) ? lotIds : [lotIds]).filter((id) => /^\d+$/.test(String(id)));
  if (!ids.length) return { moved: 0, notified: 0 };
  return withTransaction(async (client) => {
    const target = await category(client, categoryId);
    if (!target.active) throw bad('Choose an active category.');
    const lots = (await client.query(
      `SELECT l.*, a.status AS auction_status
       FROM lots l JOIN auctions a ON a.id = l.auction_id
       WHERE l.id = ANY($1::bigint[]) AND a.status <> 'closed'`,
      [ids]
    )).rows;
    await client.query(
      `UPDATE lots SET category = $2
       WHERE id = ANY($1::bigint[])
         AND auction_id IN (SELECT id FROM auctions WHERE status <> 'closed')`,
      [ids, target.name]
    );
    let notified = 0;
    for (const lot of lots) {
      lot.category = target.name;
      if (lot.auction_status === 'open') notified += (await notifyMatches(client, lot)).length;
    }
    return { moved: lots.length, notified };
  });
}

function findUnmatched(names, lotRows, prefRows) {
  const known = new Set(names.map((name) => String(name).toLowerCase()));
  const unmatchedLots = lotRows
    .filter((row) => !known.has(String(row.category || '').toLowerCase()))
    .map((row) => ({ id: row.id, title: row.title, category: row.category }));
  const unmatchedPreferences = [];
  for (const row of prefRows) {
    for (const name of Array.isArray(row.categories) ? row.categories : []) {
      if (!known.has(String(name).toLowerCase())) unmatchedPreferences.push({ user_id: row.user_id, name });
    }
  }
  return { unmatchedLots, unmatchedPreferences };
}

async function integrityReport(client = null) {
  const run = client ? (sql, params) => client.query(sql, params) : query;
  const names = (await run('SELECT name FROM categories')).rows.map((row) => row.name);
  const lots = (await run('SELECT id, title, category FROM lots')).rows;
  const preferences = (await run('SELECT user_id, categories FROM preferences')).rows;
  return findUnmatched(names, lots, preferences);
}

module.exports = {
  normalizeName, dedupeArray, wordsFor, addCategory, renameCategory, moveCategory,
  deactivateCategory, reactivateCategory, deleteCategory, usageCounts, candidateLots,
  moveLots, findUnmatched, integrityReport
};
