const test = require('node:test');
const assert = require('node:assert/strict');
const { SESSION, requireAccess, loadUser, requireAdmin } = require('./gates');

function fakeRes() {
  const res = { locals: {}, redirectedTo: null };
  res.redirect = (url) => { res.redirectedTo = url; };
  return res;
}

function run(middleware, req) {
  const res = fakeRes();
  let nextCalled = false;
  let nextError = null;
  const result = middleware(req, res, (error) => { nextCalled = true; nextError = error || null; });
  const finish = () => ({ res, nextCalled, nextError });
  return result && typeof result.then === 'function' ? result.then(finish) : finish();
}

test('requireAccess lets a signed session cookie through', () => {
  const { res, nextCalled } = run(requireAccess, { signedCookies: { rdt_access: SESSION }, path: '/' });
  assert.equal(nextCalled, true);
  assert.equal(res.redirectedTo, null);
});

test('requireAccess redirects missing, unsigned or wrong cookies to /enter', () => {
  for (const signedCookies of [{}, { rdt_access: 'nope' }, { rdt_access: false }]) {
    const { res, nextCalled } = run(requireAccess, { signedCookies, path: '/' });
    assert.equal(nextCalled, false);
    assert.equal(res.redirectedTo, '/enter');
  }
});

test('requireAdmin ignores non-admin paths and the admin login page', () => {
  for (const path of ['/', '/u/3/summary', '/admin/enter', '/administrators']) {
    const { res, nextCalled } = run(requireAdmin, { signedCookies: {}, path, query: {} });
    assert.equal(nextCalled, path === '/administrators' ? false : true, path);
    if (path === '/administrators') assert.equal(res.redirectedTo, '/admin/enter');
  }
});

test('requireAdmin lets an admin session through', () => {
  const { nextCalled } = run(requireAdmin, { signedCookies: { rdt_admin: SESSION }, path: '/admin', query: {} });
  assert.equal(nextCalled, true);
});

test('requireAdmin redirects to /admin/enter keeping ?u=', () => {
  const plain = run(requireAdmin, { signedCookies: {}, path: '/admin/categories', query: {} });
  assert.equal(plain.res.redirectedTo, '/admin/enter');
  const withUser = run(requireAdmin, { signedCookies: {}, path: '/admin', query: { u: '4 2' } });
  assert.equal(withUser.res.redirectedTo, '/admin/enter?u=4%202');
});

test('loadUser reads the id from /u/:id paths', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push(params); return { rows: [{ id: 3, name: 'Ann', avatar_url: null }] }; };
  const { res, nextCalled } = await run(loadUser({ query }), { path: '/u/3/lots/9', query: { u: '99' } });
  assert.equal(nextCalled, true);
  assert.deepEqual(calls, [['3']]);
  assert.equal(res.locals.user.name, 'Ann');
  assert.equal(res.locals.userId, '3');
});

test('loadUser falls back to ?u= and to null when unknown', async () => {
  const query = async () => ({ rows: [] });
  const { res } = await run(loadUser({ query }), { path: '/admin', query: { u: '7' } });
  assert.equal(res.locals.user, null);
  assert.equal(res.locals.userId, '7');
});

test('loadUser ignores a non-numeric ?u= without hitting the database', async () => {
  let called = false;
  const query = async () => { called = true; return { rows: [] }; };
  const { res, nextCalled } = await run(loadUser({ query }), { path: '/lots/1', query: { u: '{"1","1"}' } });
  assert.equal(called, false);
  assert.equal(nextCalled, true);
  assert.equal(res.locals.user, null);
  assert.equal(res.locals.userId, '');
});

test('loadUser skips the query when there is no user in the request', async () => {
  let called = false;
  const query = async () => { called = true; return { rows: [] }; };
  const { res, nextCalled } = await run(loadUser({ query }), { path: '/auctions', query: {} });
  assert.equal(called, false);
  assert.equal(nextCalled, true);
  assert.equal(res.locals.user, null);
  assert.equal(res.locals.userId, '');
});

test('loadUser forwards database errors to next', async () => {
  const boom = new Error('db down');
  const query = async () => { throw boom; };
  const { nextCalled, nextError } = await run(loadUser({ query }), { path: '/u/1/summary', query: {} });
  assert.equal(nextCalled, true);
  assert.equal(nextError, boom);
});
