const { formatCentral, userPath } = require('../lib/format');
const { paneData } = require('../lib/panes');

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
      userPath
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
}

function renderStub(req, res, title, message) {
  renderPage(res, title, 'coming-soon', { message, path: req.path });
}

module.exports = { renderPage, renderStub };
