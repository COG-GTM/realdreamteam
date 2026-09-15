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

function isCategory(value) {
  return categories.some((category) => category.toLowerCase() === String(value || '').toLowerCase());
}

module.exports = { categories, isCategory };
