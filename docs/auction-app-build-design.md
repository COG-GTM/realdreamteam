# Auction Interest App — Build Design for the Demo

Status: **for review** (Mark: completeness, simplicity, demo data). Supersedes the "Pages",
"Seed data" and "Build order" sections of [`auction-app-v1-design.md`](auction-app-v1-design.md);
the stack and decisions there still stand. Data model is frozen in
[`auction-app-schema.md`](auction-app-schema.md) / [`db/schema.sql`](../auction-app/db/schema.sql) (#34).

Constraint: **demo tomorrow morning, < 12 hours of build time, runs on the presenter's laptop
against the shared Supabase database.**

## 1. Stack (decided)

Node 20 · Express 5 · EJS · `pg` (hand-written SQL) · `dotenv` · `node --test`. One process,
no build step, no client-side framework. ~6 dependencies.

## 2. What the demo must show (the story)

1. Pick a user (no login). Their **summary** shows lots matching their interests plus a
   **Discover** row of 5 random open lots — so a brand-new user always has something to bid on.
2. **Preferences** — change an interest, the matches change.
3. **Browse** auctions → lot detail: images (link to Wikipedia), estimates, current bid, bid history.
4. **Two tabs, two users** bid on the same lot; rejected low bid; high bidder flips.
5. **Admin adds a lot** → every matching user sees it in their **in-app notification feed**
   (unread badge) on next page load; Slack webhook is an optional extra.
6. **Outbid** → the previous high bidder gets an "outbid on …" notification in the feed.
7. **History** — favorites, bids (won / outbid / leading), notifications received.
8. **Auction closes** (silent-auction model: all lots stay open until then) → lot shows
   *SOLD to Christian for £55,000*, "SOLD!" sound, feed tells every bidder the result.

Everything below exists only to make those eight beats work.

## 3. Pages

All server-rendered; every action is a `<form method="post">` + redirect back. User identity is
in the URL (`/u/:userId/...`) so two tabs can be two people. Shared pages take `?u=:userId`
so buttons know who is acting.

| # | URL | Shows | Actions |
|---|---|---|---|
| 1 | `GET /` | User picker: avatar + name cards for every user | click → `/u/:id/summary` |
| 2 | `GET /u/:id/summary` | **Notifications** feed (unread first, badge count) · **Matches your interests**: lots matching preferences, grouped by auction, each card = thumbnail, title, artist, estimate, current bid + bidder, **why it matched** ("artist · keyword *blue*"), ♥ state, SOLD ribbon if closed · **Discover**: 5 random open lots the user hasn't bid on or favorited, re-drawn on every refresh | ♥ toggle, quick bid, mark feed read |
| 3 | `GET/POST /u/:id/preferences` | Checkbox grid of the 11 categories (`lib/categories.js`); artists and keywords as comma-separated text. Optional — no row means "no interests yet", Discover still fills the page | save → back to summary |
| 4 | `GET /auctions?u=` | All auctions as cards: house logo, title, location, live/timed, status pill, starts/closes, lot count | open |
| 5 | `GET /auctions/:id?u=` | Auction header + every lot as card (same card partial as summary) | ♥, bid |
| 6 | `GET /lots/:id?u=` | Lot detail: image gallery (each image links to `source_url`), description, estimate, starting bid, **current bid / high bidder / bid count**, full bid history table (who, amount, when), SOLD banner + winner when closed | ♥, bid form (with min-bid hint) |
| 7 | `POST /u/:id/lots/:lotId/favorite` | — | toggle ♥ |
| 8 | `POST /u/:id/lots/:lotId/bid` | — | validate, insert; error → `?error=` flash |
| 9 | `GET /u/:id/history` | Three lists newest first: **Bids** (amount, lot, status: *leading / outbid / won / lost*), **Favorites**, **Notifications** (full feed, read and unread) | — |
| 10 | `GET /admin?u=` | "Publish a lot" form (auction, lot no., title, artist, category dropdown, currency, estimates, starting bid, image URL, Wikipedia URL, description) + list of auctions with **Close now / Reopen** buttons | add lot, close, reopen |
| 11 | `POST /admin/lots` | — | insert lot + image, run matching, create `new_lot` notifications |
| 13 | `POST /u/:id/notifications/read` | — | set `read_at` on the user's unread rows |
| 12 | `POST /admin/auctions/:id/close` · `/reopen` | — | close: status=closed, set `hammer_price`/`winner_user_id` from high bid; reopen: revert. Redirect to `/admin?sold=:id` which plays `sold.mp3` |

Left out on purpose (v1): search/filter, pagination, edit/delete lot, user editing, tickets,
absentee bids, realtime push (refresh the page).

## 4. Rules (in code)

- **Bid accepted** iff auction `open` ∧ user not `banned` ∧ `amount` is a positive integer ∧
  `amount > MAX(bids.amount)` (or `≥ starting_bid ?? estimate_low` when no bids). Insert in a
  transaction. Error message tells the user the minimum.
- **Matching** (`lib/matching.js`): category ∈ prefs.categories ∨ artist ∈ prefs.artists ∨ any
  keyword appears in title or description — all comparisons case-insensitive. Returns the reasons
  so the summary can print them. Pure function, unit-tested. A user with no `preferences` row
  simply has no matches (LEFT JOIN, never seeded).
- **Discover**: `SELECT … FROM lots JOIN auctions … WHERE status='open' AND lot NOT IN (user's
  bids ∪ favorites) ORDER BY random() LIMIT 5`. Works for any number of users and any catalogue.
- **Categories**: fixed list in `lib/categories.js` (11): Contemporary Art, Modern British Art,
  Photography, Watches, Cars, Jewellery, Wine & Spirits, Design, Books & Manuscripts, Stuffed
  Animals, Miscellaneous IT Items. Admin add/drop of categories is #37.
- **Notifications** are an **in-app feed** (`notifications` table + `kind` + `read_at`):
  - `new_lot`: on new lot (admin or poller) → one row per matching user, `reason` = match reasons.
  - `outbid`: on accepted bid → one row for the previous high bidder (if different user).
  - `sold`: on auction close → one row per bidder on each sold lot ("Sold to X for Y").
  Unique on `(user_id, lot_id, kind)`. Shown on summary (unread badge) and history. Slack webhook
  delivery of unsent rows stays as an optional extra when `SLACK_WEBHOOK_URL` is set.
- **Auction status**: poller flips `upcoming→open→closed` from `starts_at`/`closes_at` every
  30 s **and** admin can force close/reopen (needed for a 5-minute demo; the schema doc says
  no manual flip — this is the one deliberate deviation, see §9).
- **Close** sets `lots.hammer_price = MAX(amount)`, `winner_user_id = high bidder` for every
  lot with bids; lots without bids stay unsold.
- **Seeding**: on start, if `auction_houses` is empty, load `data/seed/*.json`. Seed rows use
  **natural keys**, not ids: auctions by `(house name, house_ref)`, lots by `(house_ref,
  lot_number)`, users by `name`; the DB assigns ids and the loader resolves references by lookup.
  Dates in seed are **relative offsets** (`"starts_in_hours": -48`) resolved at seed time, so the demo always
  has one closed, one open, one upcoming auction whenever it's run.

## 5. Files

```
auction-app/
  package.json  server.js  .env.example  README.md
  db/schema.sql (frozen)  db/db.js (pool, query, seedIfEmpty)  db/reset.sql (TRUNCATE all, for re-demo)
  data/seed/{users,auction_houses,auctions,lots}.json
  lib/matching.js (+ .test.js)  lib/slack.js  lib/poller.js
  routes/index.js  routes/{summary,preferences,auctions,lots,history,admin}.js
  views/layout.ejs  views/{index,summary,preferences,auctions,auction,lot,history,admin}.ejs
  views/partials/lot-card.ejs  views/partials/flash.ejs
  public/styles.css  public/sold.mp3
```

Reused from the closed #24 branch (already written, only needs renames + async `pg`):
`views/*`, `styles.css`, `matching.js` + tests, `poller.js`, `slack.js`, close/SOLD flow,
`sold.mp3`, architecture diagrams.

## 6. Demo data (the "rich" part) — shape only

> **Decision (Mark):** demo data is generated in a **separate phase by a separate session**, and
> `preferences` are never pre-populated. What follows is the *shape and volume* the app should be
> built to handle, not the content. Nothing below is seeded by the app builder except the schema.

Goal: every page is full on first load, every beat in §2 has pre-existing data to point at,
and nothing looks like a fixture.

**Users (6 in the example, unbounded in practice)** — the team, with avatars (Supabase `avatars` bucket or Gravatar-style placeholders)
and *distinct, overlapping* interests so one new lot alerts 2–3 people:

| User | Categories | Artists | Keywords |
|---|---|---|---|
| Mark Porter | Contemporary Art | Kusama, Banksy | blue |
| Christian Wencel | Watches, Cars | Rolex, Ferrari | chronograph |
| Priya Shah | Photography, Contemporary Art | Cindy Sherman, Kusama | portrait |
| Diego Alvarez | Wine & Spirits, Design | — | Bordeaux, Eames |
| Aisha Rahman | Jewellery, Books & Manuscripts | Cartier | first edition |
| Tom Becker | Cars, Design | Porsche | 1960s |

Users may or may not have preferences — Discover covers the ones who don't. Many more than 6
users must work.

**Auction houses (4)**: Sotheby's, Christie's, Phillips, Bonhams — with real logo URLs and websites.

**Auctions (5, was 3)** — statuses computed from relative dates:

| Auction | House | Status at demo | Purpose |
|---|---|---|---|
| Contemporary Evening Sale, London | Sotheby's | **open** (closes in 3 days) | the main bidding stage |
| Important Watches & Motor Cars, Geneva | Phillips | **open** (closes in 5 days) | Christian's beat |
| Fine Wine, Books & Design, New York | Christie's | **upcoming** (starts in 2 weeks) | shows "upcoming" |
| Modern British Art, London | Bonhams | **closed** (last week) | pre-filled SOLD results + history |
| Photographs, Paris | Christie's | **closed** (last month) | more history depth |

**Lots (~30, was 18)**: 6–8 per open auction, 5 upcoming, 4–5 per closed auction. Every lot:
real Wikimedia image, credit, Wikipedia `source_url`, one-paragraph description written like a
catalogue note, realistic estimates in the auction's currency (GBP/CHF/USD/EUR).

**Pre-seeded activity** (so history and lot pages aren't empty):
- ~25 bids across open lots from all 6 users, timestamped over the last 3 days; two lots with a
  visible bidding war (5+ bids), several lots with one bid, a few with none (so "be the first" shows).
- Closed auctions: every lot has 2–4 bids and `hammer_price` + `winner_user_id` set; Mark won one,
  Christian won one, Mark lost one to Priya.
- ~12 favorites spread across users.
- ~10 notifications of mixed `kind`, some `read_at` set (so the feed shows a badge and history).

**Demo trigger lot** (not seeded; typed live on `/admin`): "Pumpkin (Blue)", Yayoi Kusama,
Contemporary Art, GBP 50,000–70,000, London sale — matches Mark (artist + keyword) **and**
Priya (artist), so two alerts fire.

Content questions (names, exact volume) go to the data-phase session, not this doc.

## 7. Build plan (< 12 h, one builder + Devin)

| Step | Hours | Deliverable |
|---|---|---|
| 1 | 1.5 | Scaffold (#19): pg pool, seed loader with relative dates, layout, user picker, all stubs mounted. `npm start` works against Supabase |
| 2 | 1.5 | Seed loader (natural keys, relative dates) + a *minimal* smoke dataset (2 users, 1 auction, 3 lots) so the app runs; real demo data is the separate data phase |
| 3 | 1.5 | Summary (feed + matches + Discover) + preferences + `matching.js` (+ tests) |
| 4 | 2 | Auctions, auction, lot detail; favorite + bid with validation |
| 5 | 1 | History page |
| 6 | 1.5 | Admin add-lot, poller, `new_lot`/`outbid`/`sold` feed rows, optional Slack, close/reopen + SOLD + sound |
| 7 | 1 | README, `db/reset.sql`, full click-through recording, fix-ups |
| | **10** | buffer 2 h |

Steps 3–6 are independent once 1–2 land; sequential is fine for one builder. Each step = one PR
(`feature:` / `bug:` commits), screenshots on each.

## 8. Schema review findings (Mark's DB session, 2026-09-15) — decisions (Mark, one by one)

| # | Finding | Decision |
|---|---|---|
| 1 | Seed/poller use string ids (`lot-101`) but schema ids are `BIGINT IDENTITY` | **Natural keys.** Seed files reference auctions by `(house, house_ref)` and lots by `(house_ref, lot_number)`; the DB assigns ids, the loader looks them up. No `OVERRIDING SYSTEM VALUE`. |
| 2 | `notifications UNIQUE(user_id, lot_id)` blocks an "outbid" notice after a "new lot" notice | **Notifications become an in-app feed** on the web frontend (new lot, outbid, sold), Slack optional. Schema: add `kind TEXT NOT NULL` (`new_lot` / `outbid` / `sold`), `read_at TIMESTAMPTZ`, unique becomes `(user_id, lot_id, kind)`. |
| 3 | Users without a `preferences` row match nothing | **Never pre-populate preferences.** Summary = "Matches your interests" (if any prefs) + "Discover" (5 random open lots not yet bid/favorited, re-drawn per refresh). Durable for any number of users and a changing catalogue. |
| 4 | Missing `CHECK (closes_at > starts_at)`, `hammer_price > 0`, winner-has-a-bid | Add the **two CHECKs**. No trigger for winner-has-a-bid (cross-table, needs a trigger; `close` derives winner from bids anyway). |
| 5 | Free-text categories → casing drift breaks matching | **Fixed list of 11** in `lib/categories.js` (see §4), dropdown + checkboxes, case-insensitive matching. Admin add/drop categories: **#37**. |
| 6 | Deleting a user with bids/wins fails (no `ON DELETE`) | **Intentional — governance.** Users are never deleted; `banned` instead. No change. |
| 7 | Comment says timed auctions "lots close individually" but close is auction-level | **V1 = silent auction**: all lots stay open until the auction closes, winners announced then. Fix the comment. Per-lot close after inactivity with Going… Going… Gone: **#38**. |

Schema changes from this table — #2 (`kind`, `read_at`, new unique), #4 (two CHECKs), #7
(comment) — are one small `schema.sql` PR plus the matching `ALTER`s on the live Supabase DB,
owned by the DB session since it holds the connection. Nothing else in the schema changes.

## 9. Open decisions

1. **Manual close/reopen on `/admin`** — deviates from the schema doc ("no admin page flips
   status by hand"). Needed to demo SOLD in 5 minutes without waiting for `closes_at`. Keep?
2. **Shared DB, one demo**: everyone hits the same Supabase project, so a rehearsal leaves bids
   behind. `npm run db:reset` (TRUNCATE + reseed) before the demo. OK?
3. **Images**: hotlink Wikimedia (zero work, occasional 429s) vs. upload ~30 files to the
   Supabase `lots` bucket (30 min, reliable). Recommendation: hotlink for the demo, bucket later.
4. **Bid amounts**: whole units of currency only (no cents, no increments table — #26).
