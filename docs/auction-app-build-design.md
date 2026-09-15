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

1. Pick a user (no login). Their **summary** already shows matching lots.
2. **Preferences** — change an interest, the summary changes.
3. **Browse** auctions → lot detail: images (link to Wikipedia), estimates, current bid, bid history.
4. **Two tabs, two users** bid on the same lot; rejected low bid; high bidder flips.
5. **Admin adds a lot** → Slack (or console) alert to every matching user within seconds.
6. **History** — favorites, bids (won / outbid / leading), notifications received.
7. **Auction closes** → lot shows *SOLD to Christian for £55,000*, "SOLD!" sound.

Everything below exists only to make those seven beats work.

## 3. Pages

All server-rendered; every action is a `<form method="post">` + redirect back. User identity is
in the URL (`/u/:userId/...`) so two tabs can be two people. Shared pages take `?u=:userId`
so buttons know who is acting.

| # | URL | Shows | Actions |
|---|---|---|---|
| 1 | `GET /` | User picker: avatar + name cards for the 6 seeded users | click → `/u/:id/summary` |
| 2 | `GET /u/:id/summary` | "Lots for you": matching lots grouped by auction (open first, then upcoming, then closed), each card = thumbnail, title, artist, estimate, current bid + bidder, **why it matched** ("artist · keyword *blue*"), ♥ state, SOLD ribbon if closed | ♥ toggle, quick bid |
| 3 | `GET/POST /u/:id/preferences` | Checkbox grid of the 8 categories; artists and keywords as comma-separated text | save → back to summary |
| 4 | `GET /auctions?u=` | All auctions as cards: house logo, title, location, live/timed, status pill, starts/closes, lot count | open |
| 5 | `GET /auctions/:id?u=` | Auction header + every lot as card (same card partial as summary) | ♥, bid |
| 6 | `GET /lots/:id?u=` | Lot detail: image gallery (each image links to `source_url`), description, estimate, starting bid, **current bid / high bidder / bid count**, full bid history table (who, amount, when), SOLD banner + winner when closed | ♥, bid form (with min-bid hint) |
| 7 | `POST /u/:id/lots/:lotId/favorite` | — | toggle ♥ |
| 8 | `POST /u/:id/lots/:lotId/bid` | — | validate, insert; error → `?error=` flash |
| 9 | `GET /u/:id/history` | Three lists newest first: **Bids** (amount, lot, status: *leading / outbid / won / lost*), **Favorites**, **Notifications** (what we told you and when) | — |
| 10 | `GET /admin?u=` | "Publish a lot" form (auction, lot no., title, artist, category, currency, estimates, starting bid, image URL, Wikipedia URL, description) + list of auctions with **Close now / Reopen** buttons | add lot, close, reopen |
| 11 | `POST /admin/lots` | — | insert lot + image, run matching, create notifications, deliver |
| 12 | `POST /admin/auctions/:id/close` · `/reopen` | — | close: status=closed, set `hammer_price`/`winner_user_id` from high bid; reopen: revert. Redirect to `/admin?sold=:id` which plays `sold.mp3` |

Left out on purpose (v1): search/filter, pagination, edit/delete lot, user editing, tickets,
absentee bids, realtime push (refresh the page).

## 4. Rules (in code)

- **Bid accepted** iff auction `open` ∧ user not `banned` ∧ `amount` is a positive integer ∧
  `amount > MAX(bids.amount)` (or `≥ starting_bid ?? estimate_low` when no bids). Insert in a
  transaction. Error message tells the user the minimum.
- **Matching** (`lib/matching.js`): category ∈ prefs.categories ∨ artist ∈ prefs.artists ∨ any
  keyword appears (case-insensitive) in title or description. Returns the reasons so the summary
  can print them. Pure function, unit-tested.
- **Notifications**: on new lot (admin or poller) → one `notifications` row per matching user
  (`reason` = the match reasons). Deliver rows with `sent_at IS NULL`; Slack webhook if
  `SLACK_WEBHOOK_URL` set, else `console.log('[slack] …')`. Stamp `sent_at` only on success.
- **Auction status**: poller flips `upcoming→open→closed` from `starts_at`/`closes_at` every
  30 s **and** admin can force close/reopen (needed for a 5-minute demo; the schema doc says
  no manual flip — this is the one deliberate deviation, see §9).
- **Close** sets `lots.hammer_price = MAX(amount)`, `winner_user_id = high bidder` for every
  lot with bids; lots without bids stay unsold.
- **Seeding**: on start, if `auction_houses` is empty, load `data/seed/*.json`. Every seed row
  carries a fixed integer `id` (inserted with `OVERRIDING SYSTEM VALUE`) so JSON can reference
  `auction_id: 2` and `/u/1` is always Mark. Dates in seed are **relative offsets** (`"starts_in_hours": -48`) resolved at seed time, so the demo always
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

## 6. Demo data (the "rich" part) — please review

Goal: every page is full on first load, every beat in §2 has pre-existing data to point at,
and nothing looks like a fixture.

**Users (6)** — the team, with avatars (Supabase `avatars` bucket or Gravatar-style placeholders)
and *distinct, overlapping* interests so one new lot alerts 2–3 people:

| User | Categories | Artists | Keywords |
|---|---|---|---|
| Mark Porter | Contemporary Art | Kusama, Banksy | blue |
| Christian Wencel | Watches, Cars | Rolex, Ferrari | chronograph |
| Priya Shah | Photography, Contemporary Art | Cindy Sherman, Kusama | portrait |
| Diego Alvarez | Wine & Spirits, Design | — | Bordeaux, Eames |
| Aisha Rahman | Jewellery, Books & Manuscripts | Cartier | first edition |
| Tom Becker | Cars, Design | Porsche | 1960s |

Every user gets a `preferences` row (empty arrays = "any" would match everything, so all six have
real interests).

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
- ~10 notifications already `sent_at` (so the history "Notifications" list is non-empty).

**Demo trigger lot** (not seeded; typed live on `/admin`): "Pumpkin (Blue)", Yayoi Kusama,
Contemporary Art, GBP 50,000–70,000, London sale — matches Mark (artist + keyword) **and**
Priya (artist), so two alerts fire.

Questions for you: (a) real names for the 4 extra users or keep the placeholders? (b) is 5
auctions / 30 lots the right size, or is 3 / 18 enough? (c) Slack: do you want a real webhook for
tomorrow, or is the console fallback fine?

## 7. Build plan (< 12 h, one builder + Devin)

| Step | Hours | Deliverable |
|---|---|---|
| 1 | 1.5 | Scaffold (#19): pg pool, seed loader with relative dates, layout, user picker, all stubs mounted. `npm start` works against Supabase |
| 2 | 1.5 | Seed data: 6 users, 5 auctions, ~30 lots + images, bids/favorites/notifications |
| 3 | 1.5 | Summary + preferences + `matching.js` (+ tests) |
| 4 | 2 | Auctions, auction, lot detail; favorite + bid with validation |
| 5 | 1 | History page |
| 6 | 1.5 | Admin add-lot, poller, Slack/console delivery, close/reopen + SOLD + sound |
| 7 | 1 | README, `db/reset.sql`, full click-through recording, fix-ups |
| | **10** | buffer 2 h |

Steps 3–6 are independent once 1–2 land; sequential is fine for one builder. Each step = one PR
(`feature:` / `bug:` commits), screenshots on each.

## 8. Schema review findings (Mark's DB session, 2026-09-15) — decisions

| # | Finding | Valid? | Decision |
|---|---|---|---|
| 1 | Seed/poller use string ids (`lot-101`) but schema ids are `BIGINT IDENTITY` | **Yes** | Seed JSON carries fixed integer `id`s, inserted with `INSERT … OVERRIDING SYSTEM VALUE`; the poller inserts lots from `lots.json` whose `id` is not present. Slack links become `/lots/12`. `/u/1` is always Mark. Seed files regenerated (§6). |
| 2 | `notifications UNIQUE(user_id, lot_id)` blocks an "outbid" notice after a "new lot" notice | **Yes** | V1 sends **new-lot notifications only** (outbid was never in this design). Fix the column comment in `schema.sql`; outbid notifications tracked with realtime updates (#32). No DB change. |
| 3 | Users without a `preferences` row match nothing; seed files are still v2 shape | **Yes** | Seed a `preferences` row for all 6 users **and** the app `LEFT JOIN`s with `COALESCE(categories,'{}')` so a user without a row still renders. Seed files regenerated. |
| 4 | Missing `CHECK (closes_at > starts_at)`, `hammer_price > 0`, winner-has-a-bid | Partly | Add `CHECK (closes_at > starts_at)` (cheap, catches seed typos). The other two stay app-enforced (`close` derives both from the bids table, so they can't disagree). |
| 5 | Free-text categories → casing drift breaks matching | **Yes** | One list in `lib/categories.js` (the 8 categories) drives the admin dropdown and the preferences checkboxes; matching compares case-insensitively. No CHECK constraint (awkward on `TEXT[]`). |
| 6 | Deleting a user with bids/wins fails (no `ON DELETE`) | Not a bug | Intentional audit trail. We never delete users; "reset" = `banned` or the full `db/reset.sql` TRUNCATE. |
| 7 | Comment says timed auctions "lots close individually" but close is auction-level | **Yes** (comment) | Reword the comment: timed = online over several days, closes as a whole; per-lot close times deferred. |

Schema changes from this table (comments for #2/#7, CHECK for #4) are a small `schema.sql` PR
plus `ALTER`/`COMMENT` on the live Supabase DB — owned by the DB session, since it has the
connection. Nothing else in the schema changes.

## 9. Open decisions

1. **Manual close/reopen on `/admin`** — deviates from the schema doc ("no admin page flips
   status by hand"). Needed to demo SOLD in 5 minutes without waiting for `closes_at`. Keep?
2. **Shared DB, one demo**: everyone hits the same Supabase project, so a rehearsal leaves bids
   behind. `npm run db:reset` (TRUNCATE + reseed) before the demo. OK?
3. **Images**: hotlink Wikimedia (zero work, occasional 429s) vs. upload ~30 files to the
   Supabase `lots` bucket (30 min, reliable). Recommendation: hotlink for the demo, bucket later.
4. **Bid amounts**: whole units of currency only (no cents, no increments table — #26).
