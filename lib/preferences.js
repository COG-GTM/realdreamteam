// Parsing helpers for the preferences form.

// "Yayoi Kusama, Banksy , ," -> ['Yayoi Kusama', 'Banksy']
function splitList(text) {
  return String(text || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// Checkboxes arrive as a string (one ticked) or an array (several ticked).
function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

module.exports = { splitList, asArray };
