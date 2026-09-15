function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function matchReasons(lot, preferences = {}) {
  const categories = list(preferences.categories);
  const artists = list(preferences.artists);
  const keywords = list(preferences.keywords);
  const reasons = [];

  if (artists.some((artist) => artist.toLowerCase() === String(lot.artist || '').toLowerCase())) {
    reasons.push('artist');
  }
  if (categories.some((category) => category.toLowerCase() === String(lot.category || '').toLowerCase())) {
    reasons.push('category');
  }
  const text = `${lot.title || ''} ${lot.description || ''}`.toLowerCase();
  const keyword = keywords.find((value) => text.includes(value.toLowerCase()));
  if (keyword) reasons.push(`"${keyword}"`);
  return reasons;
}

function matchesPreferences(lot, preferences = {}) {
  return matchReasons(lot, preferences).length > 0;
}

module.exports = { matchesPreferences, matchReasons };
