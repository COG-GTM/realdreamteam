const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLot } = require('./new-lot');
const { categories } = require('./categories');

const good = {
  auction_id: '1',
  lot_number: '7',
  title: ' Pumpkin (Blue) ',
  artist: 'Yayoi Kusama',
  category: 'contemporary art',
  currency: 'gbp',
  estimate_low: '50000',
  estimate_high: '70000',
  starting_bid: '',
  image_url: 'https://example.com/pumpkin.jpg'
};

test('validateLot cleans a good form', () => {
  const { lot, errors } = validateLot(good, categories);
  assert.equal(errors, undefined);
  assert.equal(lot.title, 'Pumpkin (Blue)');
  assert.equal(lot.category, 'Contemporary Art');
  assert.equal(lot.currency, 'GBP');
  assert.equal(lot.estimate_low, 50000);
  assert.equal(lot.starting_bid, null);
  assert.equal(lot.description, null);
});

test('validateLot requires auction, title and a known category', () => {
  const { errors } = validateLot({ ...good, auction_id: '', title: '', category: 'Paintings' });
  assert.equal(errors.length, 3);
});

test('validateLot rejects non-integer numbers and inverted estimates', () => {
  assert.ok(validateLot({ ...good, lot_number: '7a' }).errors);
  assert.ok(validateLot({ ...good, estimate_low: '10.5' }).errors);
  assert.ok(validateLot({ ...good, estimate_low: '80000', estimate_high: '70000' }).errors);
  assert.ok(validateLot({ ...good, starting_bid: '-5' }).errors);
});

test('validateLot accepts HTTP and site-relative image URLs', () => {
  assert.equal(validateLot({ ...good, image_url: '/images/x.jpg' }).errors, undefined);
  assert.equal(validateLot({ ...good, image_url: 'http://example.com/x.jpg' }).errors, undefined);
});

test('validateLot rejects unsafe web URL schemes', () => {
  assert.match(
    validateLot({ ...good, image_url: 'javascript:alert(1)' }).errors.join(' '),
    /Image URL must start with/
  );
  assert.match(
    validateLot({ ...good, source_url: 'data:text/plain,hello' }).errors.join(' '),
    /Source URL must start with/
  );
});

test('validateLot limits title length', () => {
  assert.match(
    validateLot({ ...good, title: 'x'.repeat(201) }).errors.join(' '),
    /title is too long \(max 200 characters\)/
  );
});
