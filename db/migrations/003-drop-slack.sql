-- Slack delivery was dropped; notifications are in-app only.
-- Idempotent: DROP COLUMN IF EXISTS.

BEGIN;

ALTER TABLE notifications DROP COLUMN IF EXISTS sent_at;

COMMENT ON TABLE notifications IS 'In-app feed: one row per (user, lot, kind). Shown on the summary (unread badge) and history pages. One notification of each kind per lot per user.';

COMMIT;
