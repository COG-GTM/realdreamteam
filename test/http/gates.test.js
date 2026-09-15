const assert = require('node:assert/strict');
const { describeHttp, Client, location, createUser } = require('../http-helper');

describeHttp('access gate over HTTP', (it) => {
  it('redirects anonymous visitors to /enter and renders the gate page', async () => {
    const client = new Client();
    const home = await client.get('/');
    assert.equal(home.status, 302);
    assert.equal(location(home), '/enter');
    const gate = await client.get('/enter');
    assert.equal(gate.status, 200);
    assert.match(await gate.text(), /ISO 8601/);
  });

  it('rejects a wrong code without setting a cookie', async () => {
    const client = new Client();
    const response = await client.enterSite('nope');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /That code did not match/);
    assert.equal(client.cookies.size, 0);
  });

  it('accepts the right code, sets a signed httpOnly cookie and lets the visitor in', async () => {
    await createUser({ name: 'Alice' });
    const client = new Client();
    const response = await client.enterSite();
    assert.equal(response.status, 302);
    assert.equal(location(response), '/');
    const cookie = response.headers.getSetCookie().find((header) => header.startsWith('rdt_access='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /^rdt_access=s%3A/, 'cookie is signed');
    const home = await client.get('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Alice/);
  });

  it('ignores a forged, unsigned cookie', async () => {
    const client = new Client();
    client.cookies.set('rdt_access', 'session');
    const home = await client.get('/');
    assert.equal(location(home), '/enter');
  });

  it('rate-limits repeated wrong codes per IP', async () => {
    const client = new Client();
    let response;
    for (let attempt = 0; attempt < 10; attempt += 1) response = await client.enterSite('wrong');
    assert.equal(response.status, 200);
    response = await client.enterSite('wrong');
    assert.equal(response.status, 429);
    assert.match(await response.text(), /Too many attempts/);
    const other = new Client();
    assert.equal((await other.enterSite('wrong')).status, 200, 'other IPs are unaffected');
  });

  it('/signout clears both gate cookies', async () => {
    const client = new Client();
    await client.enterSite();
    await client.enterAdmin();
    assert.deepEqual([...client.cookies.keys()].sort(), ['rdt_access', 'rdt_admin']);
    const response = await client.post('/signout');
    assert.equal(location(response), '/enter');
    assert.equal(client.cookies.size, 0);
    assert.equal(location(await client.get('/')), '/enter');
  });
});

describeHttp('admin gate over HTTP', (it) => {
  it('redirects to /admin/enter, carrying ?u= along', async () => {
    const client = new Client();
    await client.enterSite();
    assert.equal(location(await client.get('/admin')), '/admin/enter');
    assert.equal(location(await client.get('/admin?u=3')), '/admin/enter?u=3');
    assert.equal((await client.get('/admin/enter')).status, 200);
  });

  it('accepts the admin code and only keeps a numeric u', async () => {
    const client = new Client();
    await client.enterSite();
    assert.equal(location(await client.enterAdmin(undefined, { u: '12' })), '/admin?u=12');
    assert.equal(location(await client.enterAdmin(undefined, { u: 'x' })), '/admin');
    assert.equal((await client.get('/admin')).status, 200);
  });

  it('rejects a wrong admin code and rate-limits it', async () => {
    const client = new Client();
    await client.enterSite();
    let response;
    for (let attempt = 0; attempt < 10; attempt += 1) response = await client.enterAdmin('bad');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /did not match/);
    assert.equal((await client.enterAdmin('bad')).status, 429);
    assert.equal(client.cookies.has('rdt_admin'), false);
  });

  it('returns 404 for non-numeric admin ids', async () => {
    const client = new Client();
    await client.enterSite();
    await client.enterAdmin();
    assert.equal((await client.post('/admin/users/abc/ban')).status, 404);
  });
});
