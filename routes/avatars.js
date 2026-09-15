const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { query } = require('../db/db');
const { validateUpload, MAX_UPLOAD_BYTES } = require('../lib/avatars');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});

function backToPreferences(res, userId, flash, isError) {
  const key = isError ? 'error' : 'flash';
  res.redirect(`/u/${userId}/preferences?${key}=${encodeURIComponent(flash)}`);
}

// Serves an uploaded picture straight from Postgres. Default icons are static
// files under /avatars/defaults and never reach this route.
router.get('/avatars/:userId', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.userId)) return next();
    const result = await query(
      'SELECT avatar_data, avatar_mime FROM users WHERE id = $1 AND avatar_data IS NOT NULL',
      [req.params.userId]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).end();
    const etag = `"${crypto.createHash('sha1').update(row.avatar_data).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set({
      'Content-Type': row.avatar_mime,
      'Cache-Control': 'private, max-age=300',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(row.avatar_data);
  } catch (error) {
    next(error);
  }
});

router.post('/u/:userId/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return backToPreferences(res, req.params.userId, 'Images must be 2 MB or smaller.', true);
    }
    if (error) return next(error);
    next();
  });
}, async (req, res, next) => {
  try {
    if (!res.locals.user) return res.status(404).send('User not found');
    const check = validateUpload(req.file);
    if (!check.ok) return backToPreferences(res, req.params.userId, check.error, true);
    await query(
      'UPDATE users SET avatar_data = $1, avatar_mime = $2 WHERE id = $3',
      [req.file.buffer, req.file.mimetype, req.params.userId]
    );
    backToPreferences(res, req.params.userId, 'Profile picture updated');
  } catch (error) {
    next(error);
  }
});

router.post('/u/:userId/avatar/reset', async (req, res, next) => {
  try {
    if (!res.locals.user) return res.status(404).send('User not found');
    await query('UPDATE users SET avatar_data = NULL, avatar_mime = NULL WHERE id = $1', [req.params.userId]);
    backToPreferences(res, req.params.userId, 'Back to your default avatar');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
