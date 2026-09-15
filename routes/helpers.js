const { formatCentral, userPath } = require('../lib/format');
const { paneData } = require('../lib/panes');
const { describeActivity, relativeTime } = require('../lib/activity');

async function renderPage(res, title, view, data = {}) {
  try {
    const panes = data.gate ? {} : await paneData(res.locals.userId);
    const body = await new Promise((resolve, reject) => {
      res.render(view, { ...data, title }, (error, html) => {
        if (error) reject(error);
        else resolve(html);
      });
    });
    res.render('layout', {
      ...data,
      ...panes,
      title,
      body,
      user: res.locals.user || null,
      userId: res.locals.userId || '',
      formatCentral,
      userPath,
      describeActivity,
      relativeTime
    });
  } catch (error) {
    console.error(error);
    res.status(500).type('text').send('Something went wrong.');
  }
}

function renderStub(req, res, title, message) {
  renderPage(res, title, 'coming-soon', { message, path: req.path });
}

// "/u/3/lots/9?flash=Bid+placed!" (with &error=1 for error messages).
function flashUrl(path, message, isError) {
  return `${path}?flash=${encodeURIComponent(message)}${isError ? '&error=1' : ''}`;
}

// Builds "<path>?u=...&flash=..." so the user in the nav is kept across admin redirects.
function categoryUrl(req, path, params = {}) {
  const search = new URLSearchParams();
  const userId = (req.body && req.body.u) || (req.query && req.query.u);
  if (userId) search.set('u', userId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const text = search.toString();
  return `${path}${text ? `?${text}` : ''}`;
}

function adminUrl(req, params = {}) {
  return categoryUrl(req, '/admin', params);
}

module.exports = { renderPage, renderStub, flashUrl, adminUrl, categoryUrl };
