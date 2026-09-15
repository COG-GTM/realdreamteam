const express = require('express');
const { query, withTransaction } = require('../db/db');
const { renderPage } = require('./helpers');
const { categories } = require('../lib/categories');

const router = express.Router();

// "Yayoi Kusama, Banksy , ," -> ['Yayoi Kusama', 'Banksy']
function splitList(text) {
  return String(text || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// Checkboxes arrive as a string (one ticked) or an array (several ticked).
function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

router.get('/u/:userId/preferences', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.status(404).send('User not found');
    const result = await query(
      'SELECT categories, artists, keywords FROM preferences WHERE user_id = $1',
      [req.params.userId]
    );
    const prefs = result.rows[0] || { categories: [], artists: [], keywords: [] };
    renderPage(res, 'Preferences', 'preferences', {
      userId: req.params.userId,
      categories,
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
    const chosen = asArray(req.body.categories).filter((value) => categories.includes(value));
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
