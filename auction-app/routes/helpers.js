function renderPage(res, title, view, data = {}) {
  res.render(view, { ...data, title }, (error, body) => {
    if (error) return res.status(500).send(error.message);
    res.render('layout', { ...data, title, body, user: res.locals.user || null });
  });
}

function renderStub(req, res, title, message) {
  renderPage(res, title, 'coming-soon', { message, path: req.path });
}

module.exports = { renderPage, renderStub };
