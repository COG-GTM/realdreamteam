function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function preferencesValue(prefs, camel, snake) {
  return prefs?.[camel] ?? prefs?.[snake];
}

function matchReasons(item, prefs = {}) {
  const categories = list(prefs.categories);
  const artists = list(prefs.artists);
  const keywords = list(prefs.keywords);
  const reasons = [];
  if (artists.some((artist) => artist.toLowerCase() === String(item.artist || '').toLowerCase())) {
    reasons.push('artist');
  }
  if (categories.some((category) => category.toLowerCase() === String(item.category || '').toLowerCase())) {
    reasons.push('category');
  }
  const title = String(item.title || '').toLowerCase();
  const keyword = keywords.find((value) => title.includes(value.toLowerCase()));
  if (keyword) reasons.push(`"${keyword}"`);

  const min = Number(preferencesValue(prefs, 'minPrice', 'min_price'));
  const max = Number(preferencesValue(prefs, 'maxPrice', 'max_price'));
  const estimate = Number(item.estimate_low ?? item.estimateLow);
  if (Number.isFinite(min) && Number.isFinite(max) && estimate >= min && estimate <= max) {
    reasons.push('price range');
  }
  return reasons;
}

function matchesPreferences(item, prefs = {}) {
  return matchReasons(item, prefs).length > 0;
}

module.exports = { matchesPreferences, matchReasons };
