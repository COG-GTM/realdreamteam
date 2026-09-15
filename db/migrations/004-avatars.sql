-- Fun default avatars (repo SVGs) plus user-uploaded pictures stored in Postgres.
-- Idempotent: ADD COLUMN IF NOT EXISTS; the UPDATE only touches rows still on
-- Gravatar or with no avatar.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_data BYTEA,
  ADD COLUMN IF NOT EXISTS avatar_mime TEXT;

COMMENT ON COLUMN users.avatar_url  IS 'App-relative path of the default icon assigned at account creation, e.g. /avatars/defaults/otter.svg. Shown unless avatar_data is set.';
COMMENT ON COLUMN users.avatar_data IS 'Bytes of a picture the user uploaded (PNG/JPEG/WebP/GIF, max 2 MB). NULL = use avatar_url.';
COMMENT ON COLUMN users.avatar_mime IS 'MIME type of avatar_data.';

-- Existing users get a default icon; `node db/assign-avatars.js` does the same
-- from the app's icon library (run it after this migration, before db:reset is
-- not required since the seed loader assigns icons itself).
UPDATE users SET avatar_url = NULL
 WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE '/avatars/defaults/%';

COMMIT;
