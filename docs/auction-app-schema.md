# Auction Interest App — Schema Proposal (v2)

Status: proposal. Combines the whiteboard session (`schema-whiteboard.jpeg`) with how Sotheby's,
Christie's, Phillips and Bonhams actually model their sites (sources at the bottom). Replaces the
`## Schema` section of `auction-app-v1-design.md` if accepted.

Guiding rule (from Mark): **simple enough for non-technical teammates to read and edit.**
Every table fits on one screen; anything the demo doesn't need is in "Left out" at the end.

![Whiteboard](schema-whiteboard.jpeg)

## Whiteboard → tables

| Whiteboard | Table | Notes |
|---|---|---|
| AuctionHouses (Name) | `auction_houses` | Sotheby's, Christie's, Phillips, Bonhams — seeded |
| Items (AuctionHouse, Picture, History, URL, Price) | `items` + `item_images` + `bids` | House comes via the sale; "History" = the `bids` rows for that item; URL = link to the real lot page |
| Users (userid) | `users` | unchanged from v1 |
| Favorites (Item ⇄ User) | `favorites` | renamed from v1 `likes` to match the whiteboard and the ♥ in the UI |
| Bid (Item, Time, User, Price) | `bids` | exactly those four columns + id |
| Bidding → auction open / close | `sales.status` + `sales.closes_at` | bids only accepted while the sale is `open` |
| Notification | `notifications` | unchanged from v1 |
| Browsing | — | a page, not a table |
| PG (Postgres drawing) | — | v1 stays on SQLite (#8); the DDL below is plain SQL that runs on both |

## What the auction houses taught us

Observed on one upcoming sale + one lot page per house (details in the sources section):

1. Every house has a **sale** (auction) entity with a public number (`N12270`, `24434`, `UK030426`, `32587`), a city, a date, and a type: **live** (one evening) or **timed/online** (lots close individually). We call this `sales` — the v1 `events` table renamed to the industry word.
2. Sales have a **status** the UI depends on: upcoming → open for bidding → closed. Bonhams shows "Open for bidding"; Sotheby's shows "4 days until lots begin closing".
3. A lot has a **title and a maker/artist as separate fields**, and the artist can be empty (a Sotheby's wine lot has none). v1 already did this.
4. **Estimates are a low/high range in a currency**, and can be missing ("Upon Request"). So `estimate_low/high` are nullable and there's a `currency` column.
5. **Live bid state is separate from the result.** Sotheby's shows current bid + bid count + "reserve met" while open; hammer price appears only after close. We derive current bid from `bids` and store `hammer_price` on the item once the sale is closed.
6. Lots have **several images** (Bonhams labels 1–4). Hence `item_images` instead of a single `image_url`; the first one is the thumbnail.
7. Every house links to a **condition report / provenance**; we don't store them, we store the **`source_url`** back to the real lot page (whiteboard "URL").
8. Favoriting exists everywhere (Sotheby's "Save", Phillips "Favorite", Bonhams "Follow"), always as user ⇄ lot. Nobody shows public bid-by-bid history, but bid *counts* are shown — our `bids` table gives both.

## Schema (`db/schema.sql`)

```sql
CREATE TABLE auction_houses (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,                 -- "Sotheby's"
  website     TEXT                           -- "https://www.sothebys.com"
);

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE preferences (                   -- unchanged from v1
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  categories  TEXT,                          -- JSON array of strings
  artists     TEXT,                          -- JSON array of strings
  keywords    TEXT,                          -- JSON array of strings
  min_price   INTEGER,
  max_price   INTEGER
);

CREATE TABLE sales (                         -- was "events" in v1
  id               TEXT PRIMARY KEY,         -- "ev-2026-10-london"
  auction_house_id INTEGER NOT NULL REFERENCES auction_houses(id),
  sale_number      TEXT,                     -- the house's own number, e.g. "N12270"
  title            TEXT NOT NULL,
  location         TEXT,                     -- "London"
  sale_type        TEXT NOT NULL DEFAULT 'live'
                   CHECK (sale_type IN ('live','timed')),
  status           TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming','open','closed')),
  starts_at        TEXT NOT NULL,            -- ISO-8601 UTC
  closes_at        TEXT,                     -- when bidding stops (timed) / sale ends (live)
  source_url       TEXT                      -- the sale page on the house's site
);

CREATE TABLE items (                         -- one lot
  id             TEXT PRIMARY KEY,           -- "lot-101"
  sale_id        TEXT NOT NULL REFERENCES sales(id),
  lot_number     INTEGER,
  title          TEXT NOT NULL,
  artist         TEXT,                       -- maker; NULL for wine, cars, etc.
  category       TEXT NOT NULL,              -- "Contemporary Art"
  description    TEXT,                       -- medium, dimensions, year, one paragraph
  currency       TEXT NOT NULL DEFAULT 'USD',
  estimate_low   INTEGER,                    -- NULL = "estimate upon request"
  estimate_high  INTEGER,
  starting_bid   INTEGER,                    -- first acceptable bid; defaults to estimate_low
  hammer_price   INTEGER,                    -- filled in when the sale is closed
  source_url     TEXT,                       -- Wikipedia article (demo) or the real lot page
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE item_images (
  item_id   TEXT NOT NULL REFERENCES items(id),
  position  INTEGER NOT NULL,                -- 1 = thumbnail
  url       TEXT NOT NULL,
  credit    TEXT,                            -- licence / attribution
  PRIMARY KEY (item_id, position)
);

CREATE TABLE favorites (                     -- was "likes" in v1
  user_id   INTEGER NOT NULL REFERENCES users(id),
  item_id   TEXT    NOT NULL REFERENCES items(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE bids (                          -- the whiteboard "Bid": item, time, user, price
  id         INTEGER PRIMARY KEY,
  item_id    TEXT    NOT NULL REFERENCES items(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,
  placed_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  sale_id  TEXT    NOT NULL REFERENCES sales(id),
  booked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sale_id)
);

CREATE TABLE notifications (                 -- unchanged from v1
  user_id  INTEGER NOT NULL REFERENCES users(id),
  item_id  TEXT    NOT NULL REFERENCES items(id),
  sent_at  TEXT,                             -- NULL = not yet delivered to Slack
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX bids_item_idx ON bids(item_id, amount DESC);
CREATE INDEX items_sale_idx ON items(sale_id);
```

`db/db.js` still runs `PRAGMA foreign_keys = ON` on every connection.

## Rules the app enforces (in code, not the DB)

- **Bidding is open** only when `sales.status = 'open'` (the poller flips `upcoming → open` when
  `starts_at` passes and `open → closed` when `closes_at` passes; the admin page can also flip it).
- A bid is accepted only if `amount > MAX(bids.amount)` for the item, or `>= starting_bid`
  (falls back to `estimate_low`) if there are no bids yet.
- **Current bid** = `MAX(bids.amount)`; **bid count** = `COUNT(*)`; **high bidder** = user of the max row.
  Never stored, always computed — so it can't go stale.
- **History page** (`/u/:id/history`) = that user's rows in `bids` + `favorites` + `tickets`, newest first,
  with "you are / are not the high bidder" computed per bid.
- **Item "History"** on the whiteboard = all `bids` for the item, shown on the lot page as a count and,
  for the current user, their own bids.

## Seed data changes

The seed-data changes were done in this PR:

- `data/seed/auction_houses.json` — 4 auction-house rows.
- `data/seed/events.json` was renamed to `data/seed/sales.json`; each sale now has
  `auctionHouseId`, `saleNumber`, `saleType`, `status`, `closesAt`, and `sourceUrl`.
- `data/seed/items.json` — `eventId` became `saleId`; `imageUrl` became
  `images: [{url, credit}]`; each lot now has `lotNumber`, `description`, `currency`,
  `startingBid`, and `sourceUrl`. The 18 existing lots carry over.
- `data/seed/IMAGE_CREDITS.md` — unchanged Wikimedia Commons attribution record.

## Left out on purpose (tracked for later)

Condition reports, provenance, literature, viewing schedules, bid increments tables, reserve prices,
absentee/phone bid types, registration/KYC, multiple currencies per sale, artist entity table,
saved searches, follow-artist. All exist on the real sites; none are needed for the demo.

## Sources (pages inspected)

- Sotheby's — [Napa Valley Fine Wine Auction](https://www.sothebys.com/en/buy/auction/2026/napa-valley-fine-wine-auction?showDetails), [Lot 4001](https://www.sothebys.com/en/buy/auction/2026/napa-valley-fine-wine-auction/napa-valley-vintners-the-best-of-napa-valley-in) — timed sale, current bid + bid count + "reserve met" shown, estimate "Upon Request", "Save" lot.
- Christie's — [Sale 24434 overview](https://www.christies.com/en/auction/auction-24434-cks/overview), [Lot 1](https://www.christies.com/en/lot/lot-6598670) — live sale, sale number, nine viewing sessions, live/phone/in-room/absentee bidding.
- Phillips — [UK030426](https://www.phillips.com/auction/UK030426), [Lot 221](https://www.phillips.com/detail/david-hockney/UK030426/221) — sale code, GBP estimate range, "No Reserve" badges, "Favorite" lot, browse-artist link.
- Bonhams — [Auction 32587](https://www.bonhams.com/auction/32587/the-sandy-lerner-cat-collection-part-i/), [Lot 11](https://www.bonhams.com/auction/32587/lot/11/henriette-ronner-knip-dutch-1821-1909-a-fluffy-white-cat/) — "Open for bidding" status, four numbered images, structured provenance, "Follow" lot.
