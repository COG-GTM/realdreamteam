function includesIgnoreCase(values, value) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return values.some((candidate) => String(candidate).toLowerCase() === normalized);
}

function matchesPreferences(item, prefs) {
  const categories = prefs.categories || [];
  const artists = prefs.artists || [];
  const keywords = prefs.keywords || [];
  const categoryMatch = includesIgnoreCase(categories, item.category);
  const artistMatch = includesIgnoreCase(artists, item.artist);
  const title = String(item.title || '').toLowerCase();
  const keywordMatch = keywords.some((keyword) => title.includes(String(keyword).toLowerCase()));
  const itemLow = item.estimateLow ?? item.estimate_low;
  const itemHigh = item.estimateHigh ?? item.estimate_high;
  const minPrice = prefs.minPrice ?? prefs.min_price ?? -Infinity;
  const maxPrice = prefs.maxPrice ?? prefs.max_price ?? Infinity;

  return (categoryMatch || artistMatch || keywordMatch)
    && itemLow <= maxPrice
    && itemHigh >= minPrice;
}

function loadPreferences(db, userId) {
  const row = db.prepare(`
    SELECT categories, artists, keywords, min_price, max_price
    FROM preferences WHERE user_id = ?
  `).get(userId);
  if (!row) return null;

  const parseArray = (value) => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    categories: parseArray(row.categories),
    artists: parseArray(row.artists),
    keywords: parseArray(row.keywords),
    minPrice: row.min_price,
    maxPrice: row.max_price
  };
}

module.exports = { matchesPreferences, loadPreferences };
