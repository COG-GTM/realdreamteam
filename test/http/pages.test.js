const assert = require('node:assert/strict');
const {
  describeHttp, Client, location, createUser, setPreferences, createAuction, createLot, createCategory, createBid, rows, notificationsFor
} = require('../http-helper');

async function signedIn() {
  const client = new Client();
  await client.enterSite();
  return client;
}

describeHttp('lot pages', (it) => {
  it('renders a lot with its bids and returns 404 for unknown lots', async () => {
    const client = await signedIn();
    const bidder = await createUser({ name: 'Bea Bidder' });
    const lot = await createLot({ title: 'Blue Canvas', starting_bid: 100 });
    await createBid(lot.id, bidder.id, 150);
    const page = await client.get(`/lots/${lot.id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Blue Canvas/);
    assert.match(html, /Bea Bidder/);
    assert.match(html, /150/);
    const missing = await client.get('/lots/999999');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /That lot does not exist/);
  });

  it('places a bid and redirects back with a flash, or an error flash when rejected', async () => {
    const client = await signedIn();
    const user = await createUser();
    const other = await createUser();
    const lot = await createLot({ starting_bid: 100 });
    const ok = await client.post(`/u/${user.id}/lots/${lot.id}/bid`, { amount: '120' });
    assert.equal(ok.status, 302);
    assert.equal(location(ok), `/u/${user.id}/lots/${lot.id}?flash=Bid%20placed!`);
    const low = await client.post(`/u/${other.id}/lots/${lot.id}/bid`, { amount: '110' });
    assert.match(location(low), /\?flash=.*&error=1$/);
    assert.deepEqual((await rows('SELECT amount FROM bids WHERE lot_id = $1', [lot.id])).map((row) => Number(row.amount)), [120]);
    const flashed = await client.get(location(low));
    assert.match(await flashed.text(), /at least 130 \(current high bid 120 \+ 10 step\)/);
  });

  it('toggles a favorite and returns to the referer', async () => {
    const client = await signedIn();
    const user = await createUser();
    const lot = await createLot();
    const first = await client.post(`/u/${user.id}/lots/${lot.id}/favorite`, {}, { headers: { referer: '/u/1/summary' } });
    assert.equal(location(first), '/u/1/summary');
    assert.equal((await rows('SELECT 1 FROM favorites WHERE user_id = $1 AND lot_id = $2', [user.id, lot.id])).length, 1);
    const second = await client.post(`/u/${user.id}/lots/${lot.id}/favorite`, {});
    assert.equal(location(second), `/u/${user.id}/lots/${lot.id}`);
    assert.equal((await rows('SELECT 1 FROM favorites WHERE user_id = $1', [user.id])).length, 0);
  });
});

describeHttp('preferences', (it) => {
  it('normalises checkboxes and comma lists, dropping unknown categories', async () => {
    const client = await signedIn();
    await createCategory('Contemporary Art');
    await createCategory('Watches');
    const user = await createUser();
    const response = await client.post(`/u/${user.id}/preferences`, new URLSearchParams([
      ['categories', 'contemporary art'],
      ['categories', 'Ghosts'],
      ['artists', ' Kusama, , Hockney '],
      ['keywords', 'blue']
    ]));
    assert.equal(location(response), `/u/${user.id}/summary?flash=Preferences%20saved`);
    const [prefs] = await rows('SELECT categories, artists, keywords FROM preferences WHERE user_id = $1', [user.id]);
    assert.deepEqual(prefs, { categories: ['Contemporary Art'], artists: ['Kusama', 'Hockney'], keywords: ['blue'] });

    const page = await client.get(`/u/${user.id}/preferences`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Kusama, Hockney/);
  });

  it('returns 404 for an unknown user', async () => {
    const client = await signedIn();
    assert.equal((await client.get('/u/999999/preferences')).status, 404);
    assert.equal((await client.post('/u/999999/preferences', { artists: 'x' })).status, 404);
  });
});

describeHttp('page smoke tests', (it) => {
  it('summary shows matches for the user\'s preferences and 404s for unknown users', async () => {
    const client = await signedIn();
    await createCategory('Watches');
    const user = await createUser({ name: 'Wendy' });
    await setPreferences(user.id, { categories: ['Watches'] });
    await createLot({ title: 'Steel Chronograph', category: 'Watches' });
    const page = await client.get(`/u/${user.id}/summary`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Steel Chronograph/);
    assert.equal((await client.get('/u/999999/summary')).status, 404);
  });

  it('auctions list and detail render, unknown auction 404s', async () => {
    const client = await signedIn();
    const auction = await createAuction({ title: 'Spring Sale' });
    await createLot({ auction_id: auction.id, title: 'Lot One' });
    assert.match(await (await client.get('/auctions')).text(), /Spring Sale/);
    const detail = await client.get(`/auctions/${auction.id}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /Lot One/);
    assert.equal((await client.get('/auctions/999999')).status, 404);
  });

  it('history lists bids with their state and marking notifications read redirects', async () => {
    const client = await signedIn();
    const user = await createUser();
    const rival = await createUser();
    const lot = await createLot({ title: 'Contested Lot' });
    await createBid(lot.id, user.id, 100);
    await createBid(lot.id, rival.id, 200);
    await rows(
      "INSERT INTO notifications (user_id, lot_id, kind, reason) VALUES ($1, $2, 'outbid', 'x')",
      [user.id, lot.id]
    );
    const page = await client.get(`/u/${user.id}/history`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Contested Lot/);
    assert.match(html, /Outbid/);
    const read = await client.post(`/u/${user.id}/notifications/read`, {}, { headers: { referer: `/u/${user.id}/history?x=1` } });
    assert.equal(location(read), `/u/${user.id}/history?x=1`);
    assert.ok((await notificationsFor(user.id)).every((note) => note.read_at));
    const noReferer = await client.post(`/u/${user.id}/notifications/read`, {});
    assert.equal(location(noReferer), `/u/${user.id}/summary`);
    const offsite = await client.post(`/u/${user.id}/notifications/read`, {}, { headers: { referer: 'https://evil.example/u/1/history' } });
    assert.equal(location(offsite), `/u/${user.id}/summary`, 'off-host referers are ignored');
  });

  it('panes render without and with a user', async () => {
    const client = await signedIn();
    const user = await createUser();
    await createAuction({ title: 'Pane Sale' });
    const auctions = await client.get('/panes/auctions');
    assert.equal(auctions.status, 200);
    assert.equal(auctions.headers.get('cache-control'), 'no-store');
    assert.match(await auctions.text(), /Pane Sale/);
    assert.equal((await client.get(`/panes/feed?u=${user.id}`)).status, 200);
  });

  it('admin dashboard renders and admin actions redirect with flashes', async () => {
    const client = await signedIn();
    await client.enterAdmin();
    await createCategory('Art');
    const user = await createUser({ name: 'Uma' });
    const auction = await createAuction({ title: 'Admin Sale' });
    const lot = await createLot({ auction_id: auction.id });
    await createBid(lot.id, user.id, 50);

    const dashboard = await client.get(`/admin?u=${user.id}`);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /Admin Sale/);

    const ban = await client.post(`/admin/users/${user.id}/ban`, { u: String(user.id) });
    assert.equal(location(ban), `/admin?u=${user.id}&flash=Uma+banned`);

    const added = await client.post('/admin/lots', {
      auction_id: auction.id, lot_number: '9', title: 'Admin Lot', category: 'Art', currency: 'USD', starting_bid: '10'
    });
    assert.match(location(added), /^\/admin\?flash=Lot\+added/);
    const invalid = await client.post('/admin/lots', { auction_id: auction.id, lot_number: '9', title: '' });
    assert.match(location(invalid), /^\/admin\?error=/);

    const closed = await client.post(`/admin/auctions/${auction.id}/close`, {});
    assert.equal(location(closed), `/admin?flash=Auction+closed%3A+1+sold%2C+1+unsold&sold=${auction.id}`);
    assert.equal(location(await client.post(`/admin/auctions/${auction.id}/close`, {})), '/admin?error=That+auction+is+not+open.');
    const reopened = await client.post(`/admin/auctions/${auction.id}/reopen`, {});
    assert.match(location(reopened), /^\/admin\?flash=Auction\+reopened/);
    assert.equal((await rows('SELECT status FROM auctions WHERE id = $1', [auction.id]))[0].status, 'open');
    assert.equal((await client.post('/admin/auctions/999999/closes_at', { closes_at: '2030-01-01T10:00' })).status, 404);
  });
});
