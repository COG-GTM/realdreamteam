CREATE TABLE IF NOT EXISTS auction_houses (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  website     TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  categories  TEXT,
  artists     TEXT,
  keywords    TEXT,
  min_price   INTEGER,
  max_price   INTEGER
);

CREATE TABLE IF NOT EXISTS sales (
  id               TEXT PRIMARY KEY,
  auction_house_id INTEGER NOT NULL REFERENCES auction_houses(id),
  sale_number      TEXT,
  title            TEXT NOT NULL,
  location         TEXT,
  sale_type        TEXT NOT NULL DEFAULT 'live'
                   CHECK (sale_type IN ('live','timed')),
  status           TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming','open','closed')),
  starts_at        TEXT NOT NULL,
  closes_at        TEXT,
  source_url       TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id             TEXT PRIMARY KEY,
  sale_id        TEXT NOT NULL REFERENCES sales(id),
  lot_number     INTEGER,
  title          TEXT NOT NULL,
  artist         TEXT,
  category       TEXT NOT NULL,
  description    TEXT,
  currency       TEXT NOT NULL DEFAULT 'USD',
  estimate_low   INTEGER,
  estimate_high  INTEGER,
  starting_bid   INTEGER,
  hammer_price   INTEGER,
  source_url     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_images (
  item_id   TEXT NOT NULL REFERENCES items(id),
  position  INTEGER NOT NULL,
  url       TEXT NOT NULL,
  credit    TEXT,
  PRIMARY KEY (item_id, position)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  item_id    TEXT    NOT NULL REFERENCES items(id),
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS bids (
  id         INTEGER PRIMARY KEY,
  item_id    TEXT    NOT NULL REFERENCES items(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,
  placed_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  sale_id  TEXT    NOT NULL REFERENCES sales(id),
  booked_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sale_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  item_id  TEXT    NOT NULL REFERENCES items(id),
  sent_at  TEXT,
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS bids_item_idx ON bids(item_id, amount DESC);
CREATE INDEX IF NOT EXISTS items_sale_idx ON items(sale_id);
