-- Real Dream Team — Auction Interest App
-- V1 data model, Postgres (Supabase). Agreed table-by-table with Mark, 2026-09-15.
-- 10 tables. Applied to the Supabase project on 2026-09-15. Explained in docs/schema.md.

-- ---------------------------------------------------------------- enums
CREATE TYPE auction_format AS ENUM ('live', 'timed');
CREATE TYPE auction_status AS ENUM ('upcoming', 'open', 'closed');

-- ---------------------------------------------------------------- 1. auction_houses
CREATE TABLE auction_houses (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  location TEXT,
  website  TEXT,
  logo_url TEXT
);

COMMENT ON TABLE  auction_houses          IS 'Auction houses whose auctions we track (Sotheby''s, Christie''s, Phillips, Bonhams). Seeded; rarely changes.';
COMMENT ON COLUMN auction_houses.id       IS 'Surrogate integer key.';
COMMENT ON COLUMN auction_houses.name     IS 'Display name of the house, e.g. "Sotheby''s". Unique.';
COMMENT ON COLUMN auction_houses.location IS 'Headquarters / primary city as free text, e.g. "New York" or "London".';
COMMENT ON COLUMN auction_houses.website  IS 'Homepage URL, e.g. "https://www.sothebys.com". Optional.';
COMMENT ON COLUMN auction_houses.logo_url IS 'Public URL of the house logo in the Supabase Storage "logos" bucket. Optional.';

-- ---------------------------------------------------------------- 2. users
CREATE TABLE users (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  avatar_url TEXT,
  avatar_data BYTEA,
  avatar_mime TEXT,
  banned     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  users            IS 'People using the app: they set preferences, favorite lots, bid, and get notified. Plain demo accounts, no login.';
COMMENT ON COLUMN users.id         IS 'Surrogate integer key.';
COMMENT ON COLUMN users.name       IS 'Display name.';
COMMENT ON COLUMN users.email      IS 'Contact email. Optional, unique when present.';
COMMENT ON COLUMN users.avatar_url IS 'App-relative path of the default icon assigned at account creation, e.g. /avatars/defaults/otter.svg. Shown unless avatar_data is set.';
COMMENT ON COLUMN users.avatar_data IS 'Bytes of a picture the user uploaded (PNG/JPEG/WebP/GIF, max 2 MB). NULL = use avatar_url.';
COMMENT ON COLUMN users.avatar_mime IS 'MIME type of avatar_data.';
COMMENT ON COLUMN users.banned     IS 'True if the user is blocked from bidding and favoriting. Default false.';
COMMENT ON COLUMN users.created_at IS 'When the account was created.';

-- ---------------------------------------------------------------- 3. preferences
CREATE TABLE preferences (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  categories TEXT[] NOT NULL DEFAULT '{}',
  artists    TEXT[] NOT NULL DEFAULT '{}',
  keywords   TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  preferences            IS 'What each user is looking for. One row per user; a lot matches if it hits any listed category, artist, or keyword.';
COMMENT ON COLUMN preferences.user_id    IS 'Owner. Also the primary key: exactly one preference row per user.';
COMMENT ON COLUMN preferences.categories IS 'Lot categories of interest, e.g. {"Contemporary Art","Wine"}. Empty = any.';
COMMENT ON COLUMN preferences.artists    IS 'Artists/makers of interest. Empty = any.';
COMMENT ON COLUMN preferences.keywords   IS 'Free-text words matched against lot title and description. Empty = any.';
COMMENT ON COLUMN preferences.updated_at IS 'Last time the user edited their preferences.';

-- ---------------------------------------------------------------- 4. auctions
CREATE TABLE auctions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auction_house_id BIGINT NOT NULL REFERENCES auction_houses(id),
  house_ref        TEXT,
  title            TEXT NOT NULL,
  location         TEXT,
  format           auction_format NOT NULL DEFAULT 'live',
  status           auction_status NOT NULL DEFAULT 'upcoming',
  starts_at        TIMESTAMPTZ NOT NULL,
  closes_at        TIMESTAMPTZ,
  source_url       TEXT,
  UNIQUE (auction_house_id, house_ref),
  CHECK (closes_at IS NULL OR closes_at > starts_at)
);

COMMENT ON TABLE  auctions                  IS 'A scheduled auction event run by one house: a set of lots offered together. Live = one evening in a room; timed = online over several days. Either way every lot stays open until the auction closes (silent-auction model; per-lot close is #38). Status is flipped automatically by the poller from starts_at / closes_at.';
COMMENT ON COLUMN auctions.id               IS 'Surrogate integer key.';
COMMENT ON COLUMN auctions.auction_house_id IS 'House running the auction.';
COMMENT ON COLUMN auctions.house_ref        IS 'The house''s own public reference for this auction, e.g. "N12270". Unique per house.';
COMMENT ON COLUMN auctions.title            IS 'Auction title, e.g. "Contemporary Evening Auction".';
COMMENT ON COLUMN auctions.location         IS 'City or "Online".';
COMMENT ON COLUMN auctions.format           IS 'live or timed.';
COMMENT ON COLUMN auctions.status           IS 'upcoming -> open (bidding accepted) -> closed. Set by the poller when starts_at / closes_at pass.';
COMMENT ON COLUMN auctions.starts_at        IS 'When bidding opens (UTC).';
COMMENT ON COLUMN auctions.closes_at        IS 'When bidding stops. NULL until known.';
COMMENT ON COLUMN auctions.source_url       IS 'The auction page on the house''s website.';

-- ---------------------------------------------------------------- 5. lots
CREATE TABLE lots (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auction_id     BIGINT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  lot_number     INTEGER,
  title          TEXT NOT NULL,
  artist         TEXT,
  category       TEXT NOT NULL,
  description    TEXT,
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  estimate_low   BIGINT,
  estimate_high  BIGINT,
  starting_bid   BIGINT,
  hammer_price   BIGINT CHECK (hammer_price > 0),
  winner_user_id BIGINT REFERENCES users(id),
  source_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auction_id, lot_number),
  CHECK (estimate_low IS NULL OR estimate_high IS NULL OR estimate_low <= estimate_high)
);

COMMENT ON TABLE  lots                IS 'One item offered for sale in an auction. Images live in lot_images; bids in bids. Current bid is computed from bids, never stored.';
COMMENT ON COLUMN lots.id             IS 'Surrogate integer key.';
COMMENT ON COLUMN lots.auction_id     IS 'Auction this lot is offered in.';
COMMENT ON COLUMN lots.lot_number     IS 'Position in the catalogue, e.g. 221. Unique within the auction.';
COMMENT ON COLUMN lots.title          IS 'Catalogue title, e.g. "Untitled (Blue)".';
COMMENT ON COLUMN lots.artist         IS 'Artist or maker. NULL for wine, cars, etc.';
COMMENT ON COLUMN lots.category       IS 'Category used for matching, e.g. "Contemporary Art".';
COMMENT ON COLUMN lots.description    IS 'Medium, dimensions, year - one paragraph.';
COMMENT ON COLUMN lots.currency       IS 'ISO 4217 code for all money columns on this row, e.g. USD, GBP.';
COMMENT ON COLUMN lots.estimate_low   IS 'Low estimate in whole currency units. NULL = "estimate upon request".';
COMMENT ON COLUMN lots.estimate_high  IS 'High estimate. NULL = upon request.';
COMMENT ON COLUMN lots.starting_bid   IS 'First acceptable bid. NULL = use estimate_low.';
COMMENT ON COLUMN lots.hammer_price   IS 'Final price once the auction is closed. NULL = not yet sold / unsold.';
COMMENT ON COLUMN lots.winner_user_id IS 'User whose bid won, set at close. NULL = unsold or not yet closed.';
COMMENT ON COLUMN lots.source_url     IS 'The lot page on the house''s website.';
COMMENT ON COLUMN lots.created_at     IS 'When the lot was ingested.';

-- ---------------------------------------------------------------- 6. lot_images
CREATE TABLE lot_images (
  lot_id   BIGINT  NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  url      TEXT    NOT NULL,
  credit   TEXT,
  PRIMARY KEY (lot_id, position)
);

COMMENT ON TABLE  lot_images          IS 'Photos of a lot, ordered. Position 1 is the thumbnail used in lists and notifications.';
COMMENT ON COLUMN lot_images.lot_id   IS 'Lot pictured.';
COMMENT ON COLUMN lot_images.position IS 'Display order starting at 1. Unique per lot.';
COMMENT ON COLUMN lot_images.url      IS 'Public URL in the Supabase Storage "lots" bucket.';
COMMENT ON COLUMN lot_images.credit   IS 'Licence / attribution text, e.g. "Wikimedia Commons, CC BY-SA 4.0". Optional.';

-- ---------------------------------------------------------------- 7. favorites
CREATE TABLE favorites (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lot_id     BIGINT NOT NULL REFERENCES lots(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lot_id)
);

COMMENT ON TABLE  favorites            IS 'Lots a user has hearted. Shown on their history page; used to nudge them when the lot''s auction opens.';
COMMENT ON COLUMN favorites.user_id    IS 'User who favorited.';
COMMENT ON COLUMN favorites.lot_id     IS 'Lot favorited.';
COMMENT ON COLUMN favorites.created_at IS 'When it was favorited.';

-- ---------------------------------------------------------------- 8. bids
CREATE TABLE bids (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id    BIGINT  NOT NULL REFERENCES lots(id)  ON DELETE CASCADE,
  user_id   BIGINT  NOT NULL REFERENCES users(id),
  amount    BIGINT NOT NULL CHECK (amount > 0),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  bids           IS 'Every bid placed, append-only. Current bid = MAX(amount) per lot; bid count = COUNT(*); high bidder = user of the max row. Accepted only while the lot''s auction is open, the user is not banned, and amount beats the current high bid (or starting_bid if none).';
COMMENT ON COLUMN bids.id        IS 'Surrogate integer key.';
COMMENT ON COLUMN bids.lot_id    IS 'Lot bid on.';
COMMENT ON COLUMN bids.user_id   IS 'Bidder.';
COMMENT ON COLUMN bids.amount    IS 'Bid amount in whole units of the lot''s currency.';
COMMENT ON COLUMN bids.placed_at IS 'When the bid was placed (UTC).';

-- ---------------------------------------------------------------- 9. notifications
CREATE TABLE notifications (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lot_id     BIGINT NOT NULL REFERENCES lots(id)  ON DELETE CASCADE,
  kind       TEXT   NOT NULL CHECK (kind IN ('new_lot', 'outbid', 'sold')),
  reason     TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ,
  UNIQUE (user_id, lot_id, kind)
);

COMMENT ON TABLE  notifications            IS 'In-app feed: one row per (user, lot, kind). Shown on the summary (unread badge) and history pages. One notification of each kind per lot per user.';
COMMENT ON COLUMN notifications.id         IS 'Surrogate integer key.';
COMMENT ON COLUMN notifications.user_id    IS 'Recipient.';
COMMENT ON COLUMN notifications.lot_id     IS 'Lot concerned.';
COMMENT ON COLUMN notifications.kind       IS 'new_lot = matched preferences; outbid = someone beat your high bid; sold = auction closed, result for a lot you bid on.';
COMMENT ON COLUMN notifications.reason     IS 'Human-readable text, e.g. "artist: David Hockney", "outbid by Christian at 5,500", "Sold to Mark for 55,000".';
COMMENT ON COLUMN notifications.created_at IS 'When the event happened.';
COMMENT ON COLUMN notifications.read_at    IS 'When the user saw it in the feed. NULL = unread (counts toward the badge).';

-- ---------------------------------------------------------------- 10. categories
CREATE TABLE categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_lower_idx ON categories (lower(name));

COMMENT ON TABLE categories IS 'Admin-managed lot categories. Names remain denormalized in lots and preferences.';
COMMENT ON COLUMN categories.id IS 'Surrogate integer key.';
COMMENT ON COLUMN categories.name IS 'Display spelling used in lot and preference text values. Case-insensitively unique.';
COMMENT ON COLUMN categories.position IS 'Display order, starting at 1.';
COMMENT ON COLUMN categories.active IS 'Whether this category can be selected for new preferences and lots.';
COMMENT ON COLUMN categories.created_at IS 'When the category was created.';

-- ---------------------------------------------------------------- dropped from v2
-- tickets            : everyone may bid in any open auction; no reservation needed.
-- preferences.min/max_price : no budget filtering in V1.
-- sales / events / items / likes : renamed to auctions / lots / favorites.

-- ---------------------------------------------------------------- notes for later
-- Seed data must be relative to now: one auction closed (with hammer prices/winners),
-- one open (bidding demo), one or two upcoming (matcher/notifications).
-- Deferred bidding features: github.com/COG-GTM/realdreamteam/issues?q=label:deferred-bidding
