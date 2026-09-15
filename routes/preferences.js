const express = require('express');
const { query, withTransaction } = require('../db/db');
const { renderPage } = require('./helpers');
const { listCategories, canonicalName } = require('../lib/categories');
const { splitList, asArray } = require('../lib/preferences');

const router = express.Router();

router.get('/u/:userId/preferences', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.status(404).send('User not found');
    const result = await query(
      'SELECT categories, artists, keywords, updated_at FROM preferences WHERE user_id = $1',
      [req.params.userId]
    );
    const prefs = result.rows[0] || { categories: [], artists: [], keywords: [] };
    const categoryRows = await listCategories(null, { includeInactive: true });
    const preferenceCategories = categoryRows
      .filter((category) => category.active || prefs.categories.some((name) => name.toLowerCase() === category.name.toLowerCase()))
      .map((category) => ({
        ...category,
        retired: !category.active,
        selected: prefs.categories.some((name) => name.toLowerCase() === category.name.toLowerCase()),
        isNew: Boolean(result.rows[0] && new Date(category.created_at) > new Date(prefs.updated_at))
      }));
    renderPage(res, 'Preferences', 'preferences', {
      userId: req.params.userId,
      categories: preferenceCategories,
      prefs,
      flash: req.query.flash || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/u/:userId/preferences', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.status(404).send('User not found');
    const allCategories = await listCategories(null, { includeInactive: true });
    const chosen = asArray(req.body.categories)
      .map((value) => canonicalName(value, allCategories))
      .filter(Boolean);
    const artists = splitList(req.body.artists);
    const keywords = splitList(req.body.keywords);

    await withTransaction((client) =>
      client.query(
        `INSERT INTO preferences (user_id, categories, artists, keywords)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
           SET categories = EXCLUDED.categories,
               artists    = EXCLUDED.artists,
               keywords   = EXCLUDED.keywords,
               updated_at = now()`,
        [req.params.userId, chosen, artists, keywords]
      )
    );
    res.redirect(`/u/${req.params.userId}/summary?flash=${encodeURIComponent('Preferences saved')}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
