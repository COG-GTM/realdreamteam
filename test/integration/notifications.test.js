const assert = require('node:assert/strict');
const helper = require('../db-helper');
const { unreadCount, listFeed, markAllRead } = require('../../lib/notifications');
const { paneData } = require('../../lib/panes');

const { describeDb, createUser, createAuction, createLot, rows, HOUR } = helper;

async function notify(userId, lotId, kind, createdAt, readAt = null) {
  await helper.db.query(
    `INSERT INTO notifications (user_id, lot_id, kind, reason, created_at, read_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, lotId, kind, `${kind} reason`, createdAt, readAt]
  );
}

describeDb('notifications feed', (it) => {
  it('unreadCount counts only this user\'s unread rows', async () => {
    const ann = await createUser();
    const bob = await createUser();
    const lot = await createLot();
    await notify(ann.id, lot.id, 'new_lot', new Date());
    await notify(ann.id, lot.id, 'outbid', new Date(), new Date());
    await notify(bob.id, lot.id, 'new_lot', new Date());
    assert.equal(await unreadCount(ann.id), 1);
    assert.equal(await unreadCount(bob.id), 1);
    assert.equal(await unreadCount(999999), 0);
  });

  it('listFeed returns newest first with the lot title, honouring the limit', async () => {
    const ann = await createUser();
    const auction = await createAuction();
    const first = await createLot({ auction_id: auction.id, lot_number: 1, title: 'First' });
    const second = await createLot({ auction_id: auction.id, lot_number: 2, title: 'Second' });
    const now = Date.now();
    await notify(ann.id, first.id, 'new_lot', new Date(now - 2 * HOUR));
    await notify(ann.id, second.id, 'new_lot', new Date(now - HOUR));
    await notify(ann.id, first.id, 'outbid', new Date(now));

    const feed = await listFeed(ann.id);
    assert.deepEqual(feed.map((row) => [row.kind, row.lot_title]), [['outbid', 'First'], ['new_lot', 'Second'], ['new_lot', 'First']]);
    assert.deepEqual((await listFeed(ann.id, 2)).map((row) => row.kind), ['outbid', 'new_lot']);
    assert.deepEqual(await listFeed(999999), []);
  });

  it('markAllRead stamps unread rows for one user only', async () => {
    const ann = await createUser();
    const bob = await createUser();
    const lot = await createLot();
    const earlier = new Date(Date.now() - HOUR);
    await notify(ann.id, lot.id, 'new_lot', new Date());
    await notify(ann.id, lot.id, 'outbid', new Date(), earlier);
    await notify(bob.id, lot.id, 'new_lot', new Date());
    await markAllRead(ann.id);
    const [alreadyRead] = await rows("SELECT read_at FROM notifications WHERE user_id = $1 AND kind = 'outbid'", [ann.id]);
    assert.equal(new Date(alreadyRead.read_at).getTime(), earlier.getTime(), 'existing read_at is preserved');
    assert.equal(await unreadCount(ann.id), 0);
    assert.equal(await unreadCount(bob.id), 1);
  });
});

describeDb('paneData', (it) => {
  it('lists open auctions soonest-closing first with lot counts, without a user', async () => {
    const later = await createAuction({ title: 'Later', closes_at: new Date(Date.now() + 3 * HOUR) });
    const sooner = await createAuction({ title: 'Sooner', closes_at: new Date(Date.now() + HOUR) });
    const openEnded = await createAuction({ title: 'Open-ended', closes_at: null });
    await createAuction({ title: 'Upcoming', status: 'upcoming' });
    await createAuction({ title: 'Closed', status: 'closed' });
    await createLot({ auction_id: sooner.id, lot_number: 1 });
    await createLot({ auction_id: sooner.id, lot_number: 2 });

    const data = await paneData(null);
    assert.deepEqual(data.openAuctions.map((auction) => [auction.title, auction.lot_count]),
      [['Sooner', 2], ['Later', 0], ['Open-ended', 0]]);
    assert.equal(data.openAuctions[0].house_name, (await rows('SELECT name FROM auction_houses WHERE id = $1', [sooner.auction_house_id]))[0].name);
    assert.deepEqual(data.notifications, []);
    assert.equal(data.unread, 0);
    assert.ok(later.id && openEnded.id);
  });

  it('includes the user\'s feed and unread count when a user is given', async () => {
    const ann = await createUser();
    const lot = await createLot();
    await notify(ann.id, lot.id, 'new_lot', new Date());
    await notify(ann.id, lot.id, 'sold', new Date(), new Date());
    const data = await paneData(ann.id);
    assert.equal(data.openAuctions.length, 1);
    assert.equal(data.notifications.length, 2);
    assert.equal(data.unread, 1);
  });
});
