const categories = [
  'Contemporary Art',
  'Modern British Art',
  'Photography',
  'Watches',
  'Cars',
  'Jewellery',
  'Wine & Spirits',
  'Design',
  'Books & Manuscripts',
  'Stuffed Animals',
  'Miscellaneous IT Items'
];

function rowName(value) {
  return typeof value === 'object' && value !== null ? value.name : value;
}

function isCategory(value, list = categories) {
  const wanted = String(value || '').trim().toLowerCase();
  return list.some((item) => String(rowName(item) || '').trim().toLowerCase() === wanted);
}

function canonicalName(value, list = categories) {
  const wanted = String(value || '').trim().toLowerCase();
  const found = list.find((item) => String(rowName(item) || '').trim().toLowerCase() === wanted);
  return found ? String(rowName(found)) : null;
}

async function listCategories(client = null, { includeInactive = false } = {}) {
  const run = client ? (sql, params) => client.query(sql, params) : require('../db/db').query;
  const fallback = () => categories.map((name, index) => ({
    id: null,
    name,
    position: index + 1,
    active: true
  }));
  try {
    const result = await run(
      `SELECT id, name, position, active, created_at
       FROM categories
       ${includeInactive ? '' : 'WHERE active = true'}
       ORDER BY position, id`
    );
    if (result.rows.length) return result.rows;
    if (includeInactive) return fallback();
    const anyCategories = await run('SELECT 1 FROM categories LIMIT 1');
    if (anyCategories.rows.length) return result.rows;
  } catch (error) {
    if (error.code !== '42P01') throw error;
  }
  return fallback();
}

module.exports = { categories, DEFAULT_CATEGORIES: categories, isCategory, canonicalName, listCategories };
