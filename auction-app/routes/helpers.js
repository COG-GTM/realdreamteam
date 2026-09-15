const { db, getUser, highBid, itemWithImages } = require('../db/db');

function userId(req) {
  return req.params.userId || req.query.u || '';
}

function withItemState(item, id) {
  if (!item) return null;
  const bid = highBid(item.id);
  item.highBid = bid;
  item.favorite = Boolean(id && db.prepare(
    'SELECT 1 FROM favorites WHERE user_id = ? AND item_id = ?'
  ).get(id, item.id));
  return item;
}

function itemsForSale(saleId, id) {
  return db.prepare('SELECT id FROM items WHERE sale_id = ? ORDER BY lot_number, id')
    .all(saleId).map(({ id: itemId }) => withItemState(itemWithImages(itemId), id));
}

function allSales() {
  return db.prepare(`
    SELECT s.*, h.name AS auction_house, h.website AS auction_house_website
    FROM sales s JOIN auction_houses h ON h.id = s.auction_house_id
    ORDER BY s.starts_at
  `).all();
}

function renderPage(res, view, data = {}) {
  res.render(view, data, (error, body) => {
    if (error) return res.status(500).send(error.message);
    res.render('layout', { ...data, body, title: data.title || 'Auction Interest' });
  });
}

function redirectWithError(res, path, message) {
  res.redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

module.exports = { allSales, getUser, itemsForSale, renderPage, userId, withItemState, redirectWithError };
