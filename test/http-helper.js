// Starts the real Express app on an ephemeral port and talks to it with the
// built-in fetch. Requires the test database (see db-helper.js); the app is
// started only when a group actually runs.
const test = require('node:test');
const dbHelper = require('./db-helper');

let server = null;
let baseUrl = null;

async function startApp() {
  if (server) return baseUrl;
  const app = require('../server');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

const ACCESS_CODE = process.env.ACCESS_CODE || '20240312';
const ADMIN_CODE = process.env.ADMIN_CODE || '20250714';

// Minimal cookie jar: enough for the two signed gate cookies.
class Client {
  constructor() {
    this.cookies = new Map();
    this.ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  }

  storeCookies(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';');
      const [name, value] = pair.split('=');
      const expired = attributes.some((attribute) => /^\s*expires=Thu, 01 Jan 1970/i.test(attribute));
      if (expired || value === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
  }

  // Never follows redirects, so tests can assert on Location.
  async request(method, path, { form, headers = {} } = {}) {
    const init = {
      method,
      redirect: 'manual',
      headers: {
        // The app trusts one proxy hop, so this sets req.ip for the rate limiter.
        'x-forwarded-for': this.ip,
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
        ...headers
      }
    };
    if (form) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    this.storeCookies(response);
    return response;
  }

  get(path, options) { return this.request('GET', path, options); }

  post(path, form, options = {}) { return this.request('POST', path, { ...options, form }); }

  enterSite(code = ACCESS_CODE) { return this.post('/enter', { code }); }

  enterAdmin(code = ADMIN_CODE, extra = {}) { return this.post('/admin/enter', { code, ...extra }); }
}

// Like describeDb, plus starts the app before the first case.
function describeHttp(name, define) {
  dbHelper.describeDb(name, (it) => {
    define((title, fn) => it(title, async (t) => {
      await startApp();
      return fn(t);
    }));
  });
}

function location(response) {
  return response.headers.get('location');
}

module.exports = { describeHttp, Client, location, ACCESS_CODE, ADMIN_CODE, ...dbHelper };
