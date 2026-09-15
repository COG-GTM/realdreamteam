-- Simulation foundations ("living auction house", docs/simulation-design.md):
-- hidden shadow users with personas, lineage columns for cloned auctions and
-- re-offered lots, and a site-wide activity log that powers the Live pane.
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shadow BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persona JSONB;

COMMENT ON COLUMN users.shadow  IS 'True for simulated bidders. Hidden from the profile picker and admin user list; never receives notification rows, but appears in bid histories and as a winner.';
COMMENT ON COLUMN users.persona IS 'Simulator tuning {budget, aggression, sniper, activity}. NULL for real users.';

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS cloned_from_auction_id BIGINT REFERENCES auctions(id);

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS reoffered_from_lot_id BIGINT REFERENCES lots(id);

COMMENT ON COLUMN auctions.cloned_from_auction_id IS 'The closed auction this one was cloned forward from. NULL = original auction.';
COMMENT ON COLUMN lots.reoffered_from_lot_id      IS 'The earlier lot this one re-offers in a cloned auction. NULL = first offering.';

CREATE TABLE IF NOT EXISTS activity (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('bid', 'favorite', 'new_lot', 'reoffered', 'opened', 'closed', 'sold', 'reopened')),
  actor_user_id BIGINT REFERENCES users(id)    ON DELETE CASCADE,
  lot_id        BIGINT REFERENCES lots(id)     ON DELETE CASCADE,
  auction_id    BIGINT REFERENCES auctions(id) ON DELETE CASCADE,
  amount        NUMERIC(16,2),
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_created_at_idx ON activity (created_at DESC);

COMMENT ON TABLE  activity                IS 'Site-wide event log behind the Live pane: every bid, favorite, new lot, auction open/close and sale. Append-only.';
COMMENT ON COLUMN activity.id             IS 'Surrogate integer key.';
COMMENT ON COLUMN activity.kind           IS 'bid | favorite | new_lot | reoffered | opened | closed | sold | reopened.';
COMMENT ON COLUMN activity.actor_user_id  IS 'Who did it. NULL for system events (opened, closed, new_lot).';
COMMENT ON COLUMN activity.lot_id         IS 'Lot concerned. NULL for auction-level events.';
COMMENT ON COLUMN activity.auction_id     IS 'Auction concerned.';
COMMENT ON COLUMN activity.amount         IS 'Money involved (bid amount, hammer price). NULL otherwise.';
COMMENT ON COLUMN activity.detail         IS 'Extra context, e.g. "outbid Mark".';
COMMENT ON COLUMN activity.created_at     IS 'When the event happened (UTC).';

COMMIT;
