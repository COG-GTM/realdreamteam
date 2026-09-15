const assert = require('node:assert/strict');
const { describeHttp, Client, createUser, createLot, createAuction, rows, db } = require('../http-helper');
const { placeBid } = require('../../lib/bids');

async function signedIn() {
  const client = new Client();
  await client.enterSite();
  return client;
}

describeHttp('simulation foundations', (it) => {
  it('the profile picker excludes shadow users', async () => {
    const client = await signedIn();
    const human = await createUser({ name: 'Visible Vera' });
    const shadow = await createUser({ name: 'Hidden Horace' });
    await db.query('UPDATE users SET shadow = true WHERE id = $1', [shadow.id]);

    const page = await client.get('/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Visible Vera/);
    assert.doesNotMatch(html, /Hidden Horace/);
  });

  it('the admin user list separates shadow users into a collapsed section', async () => {
    const client = await signedIn();
    await client.enterAdmin();
    await createUser({ name: 'Admin Visible' });
    const shadow = await createUser({ name: 'Sim Simulato' });
    await db.query('UPDATE users SET shadow = true WHERE id = $1', [shadow.id]);

    const page = await client.get('/admin');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Admin Visible/);
    assert.match(html, /1 simulated bidders/);
    assert.match(html, /Sim Simulato/);
    const mainList = html.split('simulated bidders')[0];
    assert.doesNotMatch(mainList, /Sim Simulato/);
  });

  it('/panes/live renders 200 with a recent bid sentence', async () => {
    const client = await signedIn();
    const bidder = await createUser({ name: 'Live Larry' });
    const lot = await createLot({ title: 'Pane Painting', starting_bid: 100 });
    assert.equal((await placeBid({ userId: bidder.id, lotId: lot.id, amount: '120' })).ok, true);

    const pane = await client.get('/panes/live');
    assert.equal(pane.status, 200);
    const html = await pane.text();
    assert.match(html, /Live/);
    assert.match(html, /Live Larry bid \$120 on Pane Painting/);
    assert.match(html, new RegExp(`/lots/${lot.id}`));
    assert.match(html, /ago/);
  });

  it('reopening a closed auction writes a reopened activity row', async () => {
    const client = await signedIn();
    await client.enterAdmin();
    const auction = await createAuction({ status: 'closed' });

    const response = await client.post(`/admin/auctions/${auction.id}/reopen`, {});
    assert.equal(response.status, 302);

    const activity = await rows("SELECT kind, auction_id FROM activity WHERE kind = 'reopened'");
    assert.equal(activity.length, 1);
    assert.equal(Number(activity[0].auction_id), Number(auction.id));
  });
});
