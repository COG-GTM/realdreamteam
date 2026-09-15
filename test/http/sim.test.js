const assert = require('node:assert/strict');
const { describeHttp, Client, createUser, createLot, createAuction, db } = require('../http-helper');
const sim = require('../../lib/sim');

async function adminClient() {
  const user = await createUser();
  const client = new Client();
  await client.enterSite();
  await client.enterAdmin(undefined, { u: String(user.id) });
  return { client, user };
}

async function signedIn() {
  const client = new Client();
  await client.enterSite();
  return client;
}

describeHttp('simulation admin', (it) => {
  it('the admin page shows the Simulation box', async () => {
    const { client, user } = await adminClient();
    const page = await client.get(`/admin?u=${user.id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Simulation/);
    assert.match(html, /actions in the last hour/);
    assert.match(html, /\/admin\/sim\/toggle/);
    assert.match(html, /\/admin\/sim\/run/);
    assert.match(html, /\/admin\/sim\/wake/);
  });

  it('a re-offered lot page shows the "Previously offered" line', async () => {
    const user = await createUser();
    const client = await signedIn();
    const previous = await createLot({ title: 'Earlier Edition', estimate_low: 1000 });
    const reoffered = await createLot({ title: 'Earlier Edition' });
    await db.query('UPDATE lots SET reoffered_from_lot_id = $2 WHERE id = $1', [reoffered.id, previous.id]);

    const page = await client.get(`/lots/${reoffered.id}?u=${user.id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Previously offered in/);
    assert.match(html, /unsold/);
    assert.match(html, new RegExp(`/lots/${previous.id}`));
  });

  it('POST /admin/sim/toggle flips the enabled flag', async () => {
    const { client, user } = await adminClient();
    const before = sim.status().enabled;
    const response = await client.post(`/admin/sim/toggle?u=${user.id}`, {});
    assert.equal(response.status, 302);
    assert.equal(sim.status().enabled, !before);
    const back = await client.post(`/admin/sim/toggle?u=${user.id}`, {});
    assert.equal(back.status, 302);
    assert.equal(sim.status().enabled, before);
  });
});
