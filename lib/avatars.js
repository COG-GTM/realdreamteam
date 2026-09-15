// Default avatars: Noto Emoji SVGs committed under public/avatars/defaults
// (Apache 2.0, see LICENSE there). Deliberately non-human, non-gendered:
// animals, places and objects only.
const fs = require('fs');
const path = require('path');

const DEFAULTS_DIR = path.join(__dirname, '..', 'public', 'avatars', 'defaults');
const DEFAULTS_URL = '/avatars/defaults';

const defaultAvatars = fs.readdirSync(DEFAULTS_DIR)
  .filter((file) => file.endsWith('.svg'))
  .map((file) => `${DEFAULTS_URL}/${file}`)
  .sort();

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function isDefaultAvatar(url) {
  return typeof url === 'string' && url.startsWith(`${DEFAULTS_URL}/`);
}

// Stable small hash so the same name always prefers the same icon.
function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

// Picks the least-used default so a room full of people gets distinct icons;
// ties are broken by the name hash so seeding is deterministic. `usage` is a
// Map of avatar url -> count of users already on it.
function pickDefaultAvatar(name, usage = new Map(), pool = defaultAvatars) {
  if (pool.length === 0) return null;
  const minUse = Math.min(...pool.map((url) => usage.get(url) || 0));
  const candidates = pool.filter((url) => (usage.get(url) || 0) === minUse);
  return candidates[hashText(name) % candidates.length];
}

// Reads current default-avatar usage from the users table.
async function defaultAvatarUsage(client) {
  const result = await client.query(
    'SELECT avatar_url, COUNT(*)::int AS count FROM users WHERE avatar_url LIKE $1 GROUP BY avatar_url',
    [`${DEFAULTS_URL}/%`]
  );
  return new Map(result.rows.map((row) => [row.avatar_url, row.count]));
}

// Validates an uploaded file: { ok: true } or { ok: false, error }.
function validateUpload(file) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return { ok: false, error: 'Choose an image file to upload.' };
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return { ok: false, error: 'Use a PNG, JPEG, WebP or GIF image.' };
  }
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Images must be 2 MB or smaller.' };
  }
  return { ok: true };
}

// URL to show for a user row: uploaded picture, default icon, or nothing.
function avatarSrc(user) {
  if (!user) return null;
  if (user.has_upload) return `/avatars/${user.id}`;
  return user.avatar_url || null;
}

function initials(name) {
  return String(name || '').split(' ').map((part) => part[0]).join('').slice(0, 2);
}

module.exports = {
  defaultAvatars,
  isDefaultAvatar,
  pickDefaultAvatar,
  defaultAvatarUsage,
  validateUpload,
  avatarSrc,
  initials,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME
};
