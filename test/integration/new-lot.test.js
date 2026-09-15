const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { createLot: createLotFromForm, notifyMatches } = require('../../lib/new-lot');

const { describeDb, createUser, setPreferences, createAuction, createCategory, rows, notificationsFor } = helper;

async function seedCategories() {
  await createCategory('Contemporary Art');
  await createCategory('Watches');
  await createCategory('Old Masters', { active: false });
}

const form = (auctionId, extra = {}) => ({
  auction_id: String(auctionId),
  lot_number: '7',
  title: 'Infinity Nets',
  artist: 'Yayoi Kusama',
  category: 'contemporary art',
  description: 'A large blue canvas',
  currency: 'usd',
  estimate_low: '1000',
  estimate_high: '2000',
  starting_bid: '500',
  ...extra
});

describeDb('createLot', (it) => {
  it('inserts the lot with canonical category and currency, plus its image', async () => {
    await seedCategories();
    const auction = await createAuction();
    const { lot, notified } = await createLotFromForm(form(auction.id, {
      image_url: 'https://img.example/a.jpg',
      image_credit: 'Photo: Someone'
    }));
    assert.equal(lot.category, 'Contemporary Art');
    assert.equal(lot.currency, 'USD');
    assert.equal(Number(lot.lot_number), 7);
    assert.equal(Number(lot.starting_bid), 500);
    assert.equal(notified, 0);
    assert.deepEqual(await rows('SELECT position, url, credit FROM lot_images WHERE lot_id = $1', [lot.id]),
      [{ position: 1, url: 'https://img.example/a.jpg', credit: 'Photo: Someone' }]);
  });

  it('skips the image row when no image URL is given', async () => {
    await seedCategories();
    const auction = await createAuction();
    const { lot } = await createLotFromForm(form(auction.id));
    assert.deepEqual(await rows('SELECT 1 FROM lot_images WHERE lot_id = $1', [lot.id]), []);
  });

  it('notifies users whose preferences match, but not banned users', async () => {
    await seedCategories();
    const byArtist = await createUser({ name: 'Artist Fan' });
    await setPreferences(byArtist.id, { artists: ['yayoi kusama'] });
    const byCategoryAndKeyword = await createUser({ name: 'Category Fan' });
    await setPreferences(byCategoryAndKeyword.id, { categories: ['Contemporary Art'], keywords: ['blue'] });
    const noMatch = await createUser({ name: 'Watch Fan' });
    await setPreferences(noMatch.id, { categories: ['Watches'] });
    const banned = await createUser({ name: 'Banned Fan', banned: true });
    await setPreferences(banned.id, { artists: ['Yayoi Kusama'] });
    const noPreferences = await createUser({ name: 'Quiet' });

    const auction = await createAuction();
    const { notified } = await createLotFromForm(form(auction.id));
    assert.equal(notified, 2);
    assert.deepEqual((await notificationsFor(byArtist.id)).map((note) => [note.kind, note.reason]), [['new_lot', 'artist']]);
    assert.deepEqual((await notificationsFor(byCategoryAndKeyword.id)).map((note) => note.reason), ['category, "blue"']);
    assert.deepEqual(await notificationsFor(noMatch.id), []);
    assert.deepEqual(await notificationsFor(banned.id), []);
    assert.deepEqual(await notificationsFor(noPreferences.id), []);
  });

  it('rejects an invalid form with a 400 error and inserts nothing', async () => {
    await seedCategories();
    const auction = await createAuction();
    await assert.rejects(
      () => createLotFromForm(form(auction.id, { title: '', category: 'Old Masters' })),
      (error) => error.status === 400 && /Title is required/.test(error.message) && /Choose a category/.test(error.message)
    );
    assert.deepEqual(await rows('SELECT 1 FROM lots'), []);
  });

  it('rejects unknown and closed auctions', async () => {
    await seedCategories();
    await assert.rejects(() => createLotFromForm(form(999999)), { status: 400, message: 'That auction does not exist.' });
    const closed = await createAuction({ status: 'closed' });
    await assert.rejects(() => createLotFromForm(form(closed.id)), { status: 400, message: 'That auction is closed.' });
    const upcoming = await createAuction({ status: 'upcoming' });
    const { lot } = await createLotFromForm(form(upcoming.id));
    assert.equal(Number(lot.auction_id), Number(upcoming.id));
  });

  it('surfaces a duplicate lot number as a database error and rolls back', async () => {
    await seedCategories();
    const auction = await createAuction();
    await createLotFromForm(form(auction.id));
    await assert.rejects(() => createLotFromForm(form(auction.id, { image_url: 'https://img.example/b.jpg' })), { code: '23505' });
    assert.equal((await rows('SELECT 1 FROM lots')).length, 1);
    assert.deepEqual(await rows('SELECT 1 FROM lot_images'), []);
  });
});

describeDb('notifyMatches', (it) => {
  it('does not duplicate an existing new_lot notification', async () => {
    const user = await createUser();
    await setPreferences(user.id, { keywords: ['canvas'] });
    const lot = await helper.createLot({ title: 'Canvas study' });
    assert.deepEqual(await notifyMatches(helper.db, lot), [user.name]);
    assert.deepEqual(await notifyMatches(helper.db, lot), []);
    assert.equal((await notificationsFor(user.id)).length, 1);
  });
});
