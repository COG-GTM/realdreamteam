const assert = require('node:assert/strict');
const { describeHttp, Client } = require('../http-helper');

describeHttp('health check', (it) => {
  it('answers /healthz without the site code once Postgres responds', async () => {
    const response = await new Client().get('/healthz');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});
