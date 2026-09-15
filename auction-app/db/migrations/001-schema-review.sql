-- Schema-review decisions (docs/auction-app-build-design.md §8), to apply on the live
-- Supabase DB that already has schema.sql from #34. Idempotent; DB is empty so no backfill.
-- After this runs, the live DB matches schema.sql on this branch exactly.

BEGIN;

-- #4: two cheap CHECKs
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_closes_after_starts;
ALTER TABLE auctions ADD  CONSTRAINT auctions_closes_after_starts
  CHECK (closes_at IS NULL OR closes_at > starts_at);

ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_hammer_price_check;
ALTER TABLE lots ADD  CONSTRAINT lots_hammer_price_check CHECK (hammer_price > 0);

-- #2: notifications become an in-app feed with a kind and read state
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind TEXT;
UPDATE notifications SET kind = 'new_lot' WHERE kind IS NULL;
ALTER TABLE notifications ALTER COLUMN kind SET NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD  CONSTRAINT notifications_kind_check
  CHECK (kind IN ('new_lot', 'outbid', 'sold'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_lot_id_key;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_lot_id_kind_key;
ALTER TABLE notifications ADD  CONSTRAINT notifications_user_id_lot_id_kind_key
  UNIQUE (user_id, lot_id, kind);

-- #2 / #7: comments
COMMENT ON TABLE  auctions IS 'A scheduled auction event run by one house: a set of lots offered together. Live = one evening in a room; timed = online over several days. Either way every lot stays open until the auction closes (silent-auction model; per-lot close is #38). Status is flipped automatically by the poller from starts_at / closes_at.';
COMMENT ON TABLE  notifications            IS 'In-app feed: one row per (user, lot, kind). Shown on the summary (unread badge) and history pages. One notification of each kind per lot per user.';
COMMENT ON COLUMN notifications.lot_id     IS 'Lot concerned.';
COMMENT ON COLUMN notifications.kind       IS 'new_lot = matched preferences; outbid = someone beat your high bid; sold = auction closed, result for a lot you bid on.';
COMMENT ON COLUMN notifications.reason     IS 'Human-readable text, e.g. "artist: David Hockney", "outbid by Christian at 5,500", "Sold to Mark for 55,000".';
COMMENT ON COLUMN notifications.created_at IS 'When the event happened.';
COMMENT ON COLUMN notifications.read_at    IS 'When the user saw it in the feed. NULL = unread (counts toward the badge).';

COMMIT;
