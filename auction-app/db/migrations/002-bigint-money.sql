-- Allow money values above the 32-bit integer range.
-- Idempotent: PostgreSQL accepts repeated conversion to BIGINT.

BEGIN;

ALTER TABLE lots
  ALTER COLUMN estimate_low TYPE BIGINT,
  ALTER COLUMN estimate_high TYPE BIGINT,
  ALTER COLUMN starting_bid TYPE BIGINT,
  ALTER COLUMN hammer_price TYPE BIGINT;

ALTER TABLE bids
  ALTER COLUMN amount TYPE BIGINT;

COMMIT;
