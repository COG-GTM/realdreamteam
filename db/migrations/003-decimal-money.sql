-- Allow money values with up to two decimal places.
-- Idempotent: PostgreSQL accepts repeated conversion to NUMERIC(16,2).

BEGIN;

ALTER TABLE lots
  ALTER COLUMN estimate_low TYPE NUMERIC(16,2),
  ALTER COLUMN estimate_high TYPE NUMERIC(16,2),
  ALTER COLUMN starting_bid TYPE NUMERIC(16,2),
  ALTER COLUMN hammer_price TYPE NUMERIC(16,2);

ALTER TABLE bids
  ALTER COLUMN amount TYPE NUMERIC(16,2);

COMMIT;
