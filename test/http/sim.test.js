const assert = require('node:assert/strict');
const { describeHttp, Client, createUser, createLot } = require('../http-helper');
const sim = require('../../lib/sim');

async function adminClient() {
  const client = new Client();
  await client.enterSite();
  await client.enterAdmin();
  return client;
}

describeHttp('simulation admin', (it) => {
  it('the admin page shows the Simulation box', async () => {
    const client = await adminClient();
    const page = await client.get('/admin');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Simulation/);
    assert.match(html, /actions in the last hour/);
    assert.match(html, /\/admin\/sim\/toggle/);
    assert.match(html, /\/admin\/sim\/run/);
    assert.match(html, /\/admin\/sim\/wake/);
  });

  it('POST /admin/sim/toggle flips the enabled flag', async () => {
    const client = await adminClient();
    const before = sim.status().enabled;
    const response = await client.post('/admin/sim/toggle', {});
    assert.equal(response.status, 302);
    assert.equal(sim.status().enabled, !before);
    const back = await client.post('/admin/sim/toggle', {});
    assert.equal(back.status, 302);
    assert.equal(sim.status().enabled, before);
  });
});
