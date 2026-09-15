// Pure matching logic: does a lot fit a user's preferences, and why?
// No database access here so it is easy to unit test (see matching.test.js).

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

// Returns short reason tags, e.g. ['artist', 'category', '"blue"'].
function matchReasons(lot, preferences = {}) {
  const categories = list(preferences.categories);
  const artists = list(preferences.artists);
  const keywords = list(preferences.keywords);
  const reasons = [];

  if (artists.some((artist) => sameText(artist, lot.artist))) {
    reasons.push('artist');
  }
  if (categories.some((category) => sameText(category, lot.category))) {
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

// Same idea as matchReasons but returns human-readable labels for the summary page,
// e.g. ['category: Contemporary Art', 'artist: Yayoi Kusama', 'keyword: blue'].
// preferences may be null (user has no preferences row) -> { matched: false, reasons: [] }.
function matchLot(lot, preferences) {
  if (!preferences) return { matched: false, reasons: [] };
  const categories = list(preferences.categories);
  const artists = list(preferences.artists);
  const keywords = list(preferences.keywords);
  const reasons = [];

  const category = categories.find((value) => sameText(value, lot.category));
  if (category) reasons.push(`category: ${lot.category}`);

  const artist = artists.find((value) => sameText(value, lot.artist));
  if (artist) reasons.push(`artist: ${lot.artist}`);

  const text = `${lot.title || ''} ${lot.description || ''}`.toLowerCase();
  for (const keyword of keywords) {
    if (text.includes(keyword.trim().toLowerCase())) reasons.push(`keyword: ${keyword.trim()}`);
  }

  return { matched: reasons.length > 0, reasons };
}

module.exports = { matchesPreferences, matchReasons, matchLot };
