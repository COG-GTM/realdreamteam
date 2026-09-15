const assert = require('node:assert/strict');
const helper = require('../db-helper');
const admin = require('../../lib/category-admin');

const { describeDb, createUser, setPreferences, createAuction, createLot, createCategory, rows } = helper;

async function names() {
  return (await rows('SELECT name, position, active FROM categories ORDER BY position, id'));
}

describeDb('category admin', (it) => {
  it('addCategory appends at the end, trims whitespace and refuses duplicates', async () => {
    await createCategory('Watches');
    const added = await admin.addCategory('  Fine   Wine ');
    assert.equal(added.name, 'Fine Wine');
    assert.equal(added.position, 2);
    assert.equal(added.active, true);
    await assert.rejects(() => admin.addCategory('fine wine'), { status: 400, message: 'Category "fine wine" already exists.' });
    await assert.rejects(() => admin.addCategory('   '), { status: 400, message: 'Category name is required.' });
  });

  it('renameCategory updates lots and preferences and dedupes merged preference lists', async () => {
    const art = await createCategory('Contemporary Art');
    await createCategory('Modern Art');
    const lot = await createLot({ category: 'contemporary art' });
    const fan = await createUser();
    await setPreferences(fan.id, { categories: ['Contemporary Art', 'Modern Art'] });
    const other = await createUser();
    await setPreferences(other.id, { categories: ['Watches'] });

    await assert.rejects(() => admin.renameCategory(art.id, 'modern art'), { status: 400 });
    const renamed = await admin.renameCategory(art.id, 'Post-War Art');
    assert.equal(renamed.name, 'Post-War Art');
    assert.equal((await rows('SELECT category FROM lots WHERE id = $1', [lot.id]))[0].category, 'Post-War Art');
    assert.deepEqual((await rows('SELECT categories FROM preferences WHERE user_id = $1', [fan.id]))[0].categories,
      ['Post-War Art', 'Modern Art']);
    assert.deepEqual((await rows('SELECT categories FROM preferences WHERE user_id = $1', [other.id]))[0].categories, ['Watches']);
    await assert.rejects(() => admin.renameCategory(999999, 'X'), { status: 400, message: 'Category not found.' });
  });

  it('moveCategory swaps positions with its neighbour and is a no-op at the edges', async () => {
    const a = await createCategory('A');
    const b = await createCategory('B');
    const c = await createCategory('C');
    await admin.moveCategory(b.id, 'down');
    assert.deepEqual((await names()).map((row) => row.name), ['A', 'C', 'B']);
    await admin.moveCategory(a.id, 'up');
    assert.deepEqual((await names()).map((row) => row.name), ['A', 'C', 'B']);
    await admin.moveCategory(c.id, 'up');
    assert.deepEqual((await names()).map((row) => row.name), ['C', 'A', 'B']);
    await assert.rejects(() => admin.moveCategory(a.id, 'sideways'), { status: 400, message: 'Invalid move direction.' });
  });

  it('deactivateCategory requires a destination when the category is in use and moves references there', async () => {
    const art = await createCategory('Art');
    const misc = await createCategory('Misc');
    const inactive = await createCategory('Retired', { active: false });
    const lot = await createLot({ category: 'Art' });
    const fan = await createUser();
    await setPreferences(fan.id, { categories: ['Art', 'Misc'] });

    await assert.rejects(() => admin.deactivateCategory(art.id), {
      status: 400,
      message: 'Choose where to move 1 lots and 1 followers before deactivating "Art".'
    });
    await assert.rejects(() => admin.deactivateCategory(art.id, { reassignTo: art.id }), { status: 400 });
    await assert.rejects(() => admin.deactivateCategory(art.id, { reassignTo: inactive.id }), { status: 400 });

    const result = await admin.deactivateCategory(art.id, { reassignTo: misc.id });
    assert.deepEqual(result.counts, { lots: 1, followers: 1 });
    assert.equal((await rows('SELECT category FROM lots WHERE id = $1', [lot.id]))[0].category, 'Misc');
    assert.deepEqual((await rows('SELECT categories FROM preferences WHERE user_id = $1', [fan.id]))[0].categories, ['Misc']);
    assert.equal((await rows('SELECT active FROM categories WHERE id = $1', [art.id]))[0].active, false);

    const reactivated = await admin.reactivateCategory(art.id);
    assert.equal(reactivated.active, true);
  });

  it('deactivateCategory needs no destination for an unused category', async () => {
    const unused = await createCategory('Unused');
    const result = await admin.deactivateCategory(unused.id);
    assert.deepEqual(result.counts, { lots: 0, followers: 0 });
    assert.equal(result.active, false);
  });

  it('deleteCategory only removes unused categories', async () => {
    const used = await createCategory('Used');
    const unused = await createCategory('Unused');
    await createLot({ category: 'used' });
    await assert.rejects(() => admin.deleteCategory(used.id), { status: 400, message: 'Cannot delete "Used" while it has lots or followers.' });
    await admin.deleteCategory(unused.id);
    assert.deepEqual((await names()).map((row) => row.name), ['Used']);
  });

  it('usageCounts reports lots (case-insensitively) and followers per category', async () => {
    await createCategory('Art');
    await createCategory('Watches');
    await createLot({ category: 'art', lot_number: 1 });
    await createLot({ category: 'Art', lot_number: 2 });
    const fan = await createUser();
    await setPreferences(fan.id, { categories: ['Watches'] });
    assert.deepEqual(await admin.usageCounts(), {
      Art: { lots: 2, followers: 0 },
      Watches: { lots: 0, followers: 1 }
    });
  });

  it('candidateLots suggests lots from live auctions whose text mentions the category', async () => {
    const watches = await createCategory('Wrist Watches');
    await createCategory('Misc');
    const open = await createAuction();
    const closed = await createAuction({ status: 'closed' });
    const suggested = await createLot({ auction_id: open.id, lot_number: 1, category: 'Misc', title: 'Steel wrist watch' });
    const other = await createLot({ auction_id: open.id, lot_number: 2, category: 'Misc', title: 'Oil painting' });
    await createLot({ auction_id: open.id, lot_number: 3, category: 'Wrist Watches', title: 'Already a watch' });
    await createLot({ auction_id: closed.id, lot_number: 1, category: 'Misc', title: 'Old watch, closed sale' });

    const result = await admin.candidateLots(watches.id);
    assert.equal(result.category.id, watches.id);
    assert.deepEqual(result.suggested.map((lot) => lot.id), [suggested.id]);
    assert.deepEqual(result.others.map((lot) => lot.id), [other.id]);
  });

  it('moveLots recategorises lots in live auctions and notifies matching users for open ones', async () => {
    const target = await createCategory('Watches');
    const retired = await createCategory('Retired', { active: false });
    await createCategory('Misc');
    const open = await createAuction({ status: 'open' });
    const upcoming = await createAuction({ status: 'upcoming' });
    const closed = await createAuction({ status: 'closed' });
    const openLot = await createLot({ auction_id: open.id, category: 'Misc' });
    const upcomingLot = await createLot({ auction_id: upcoming.id, category: 'Misc' });
    const closedLot = await createLot({ auction_id: closed.id, category: 'Misc' });
    const fan = await createUser();
    await setPreferences(fan.id, { categories: ['Watches'] });

    await assert.rejects(() => admin.moveLots([openLot.id], retired.id), { status: 400, message: 'Choose an active category.' });
    assert.deepEqual(await admin.moveLots([], target.id), { moved: 0, notified: 0 });
    assert.deepEqual(await admin.moveLots(['abc'], target.id), { moved: 0, notified: 0 });

    const result = await admin.moveLots([String(openLot.id), upcomingLot.id, closedLot.id], target.id);
    assert.deepEqual(result, { moved: 2, notified: 1 });
    const categories = Object.fromEntries((await rows('SELECT id, category FROM lots')).map((row) => [row.id, row.category]));
    assert.equal(categories[openLot.id], 'Watches');
    assert.equal(categories[upcomingLot.id], 'Watches');
    assert.equal(categories[closedLot.id], 'Misc');
    assert.deepEqual((await helper.notificationsFor(fan.id)).map((note) => [note.lot_id, note.kind]), [[String(openLot.id), 'new_lot']]);
  });

  it('integrityReport lists lots and preference entries that name unknown categories', async () => {
    await createCategory('Art');
    const good = await createLot({ category: 'art', lot_number: 1 });
    const bad = await createLot({ category: 'Ghosts', lot_number: 2 });
    const fan = await createUser();
    await setPreferences(fan.id, { categories: ['Art', 'Phantoms'] });
    const report = await admin.integrityReport();
    assert.deepEqual(report.unmatchedLots, [{ id: bad.id, title: bad.title, category: 'Ghosts' }]);
    assert.deepEqual(report.unmatchedPreferences, [{ user_id: fan.id, name: 'Phantoms' }]);
    assert.ok(!report.unmatchedLots.some((lot) => lot.id === good.id));
  });
});
