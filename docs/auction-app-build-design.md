# Auction Interest App — Build Design for the Demo

Status: **all open points decided (§9), awaiting Mark's final sign-off**. Supersedes the "Pages",
"Seed data" and "Build order" sections of [`auction-app-v1-design.md`](auction-app-v1-design.md);
the stack and decisions there still stand. Data model is frozen in
[`auction-app-schema.md`](auction-app-schema.md) / [`db/schema.sql`](../auction-app/db/schema.sql) (#34).

Constraint: **demo tomorrow morning, < 12 hours of build time.** The app runs on the **EC2
server** (one `node server.js` process behind a public URL, kept up 24/7 with `systemd`/`pm2`);
many people connect to it at once from their own browsers. Database is the shared Supabase
project, also up indefinitely. Nothing runs on a laptop.

## 1. Stack (decided)

Node 20 · Express 5 · EJS · `pg` (hand-written SQL) · `dotenv` · `node --test`. One process,
no build step, no client-side framework. ~6 dependencies.

## 2. What the demo must show (the story)

1. Open the URL, enter the **access code** (the otter's birthday, `20240312`), pick a user. Their
   **summary** always has **two sections**: **Matches your interests** (from their preferences)
   and **Discover** (5 random open lots). Both appear for every user — a user with no
   preferences gets an empty-but-inviting Matches section ("tell us what you like →") and a full
   Discover row, so everyone always has something to bid on.
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
| 0 | `GET/POST /enter` | Single field: access code, with the hint *"Your favorite otter's birthday in ISO 8601 basic format…"*. Correct (`ACCESS_CODE` env, default `20240312`) sets a cookie for 30 days; every other route redirects here without it. `/admin*` additionally asks for `ADMIN_CODE` (default `20250714`, hint *"The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE)…"*) | enter → `/` |
| 1 | `GET /` | User picker: avatar + name cards for every user | click → `/u/:id/summary` |
| 2 | `GET /u/:id/summary` | **Notifications** feed (unread first, badge count) · **Matches your interests** (always shown): lots matching preferences, grouped by auction, each card = thumbnail, title, artist, estimate, current bid + bidder, **why it matched** ("artist · keyword *blue*"), ♥ state, SOLD ribbon if closed; empty state links to preferences · **Discover** (always shown): 5 random open lots the user hasn't bid on or favorited, re-drawn on every refresh | ♥ toggle, quick bid, mark feed read |
| 3 | `GET/POST /u/:id/preferences` | Checkbox grid of the 11 categories (`lib/categories.js`); artists and keywords as comma-separated text. Most users arrive with preferences from the data phase; a user without a row simply has an empty Matches section until they save one | save → back to summary |
| 4 | `GET /auctions?u=` | All auctions as cards: house logo, title, location, live/timed, status pill, starts/closes, lot count | open |
| 5 | `GET /auctions/:id?u=` | Auction header + every lot as card (same card partial as summary) | ♥, bid |
| 6 | `GET /lots/:id?u=` | Lot detail: image gallery (each image links to `source_url`), description, estimate, starting bid, **current bid / high bidder / bid count**, full bid history table (who, amount, when), SOLD banner + winner when closed | ♥, bid form (with min-bid hint) |
| 7 | `POST /u/:id/lots/:lotId/favorite` | — | toggle ♥ |
| 8 | `POST /u/:id/lots/:lotId/bid` | — | validate, insert; error → `?error=` flash |
| 9 | `GET /u/:id/history` | Three lists newest first: **Bids** (amount, lot, status: *leading / outbid / won / lost*), **Favorites**, **Notifications** (full feed, read and unread) | — |
| 10 | `GET /admin?u=` | "Publish a lot" form (auction, lot no., title, artist, category dropdown, currency, estimates, starting bid, image URL, Wikipedia URL, description) + list of auctions with **Close now / Reopen** buttons and an editable **closes_at** field | add lot, close, reopen, re-time |
| 11 | `POST /admin/lots` | — | insert lot + image, run matching, create `new_lot` notifications |
| 13 | `POST /u/:id/notifications/read` | — | set `read_at` on the user's unread rows |
| 12 | `POST /admin/auctions/:id/close` · `/reopen` | — | close: status=closed, set `hammer_price`/`winner_user_id` from high bid; reopen: revert. Redirect to `/admin?sold=:id` which plays `sold.mp3` |

Left out on purpose (v1): search/filter, pagination, edit/delete lot, user editing, tickets,
absentee bids, realtime push (refresh the page).

## 4. Rules (in code)

- **Bid accepted** iff auction `open` ∧ user not `banned` ∧ `amount` is a positive integer ∧
  `amount > MAX(bids.amount)` (or `≥ starting_bid ?? estimate_low` when no bids). Runs in a
  transaction that first does `SELECT … FROM lots WHERE id=$1 FOR UPDATE`, so two simultaneous
  bids on one lot are serialised and each sees the other's result. Error tells the user the minimum.
- **Matching** (`lib/matching.js`): category ∈ prefs.categories ∨ artist ∈ prefs.artists ∨ any
  keyword appears in title or description (supersedes the v1 doc's "title only") — all
  comparisons case-insensitive. Returns the reasons
  so the summary can print them. Pure function, unit-tested. A user with no `preferences` row
  has zero matches (LEFT JOIN); the app never creates a row on their behalf.
- **Discover**: `SELECT … FROM lots JOIN auctions … WHERE status='open' AND lot NOT IN (user's
  bids ∪ favorites) ORDER BY random() LIMIT 5`. Works for any number of users and any catalogue.
- **Summary always renders both sections**, Matches and Discover, for every user, with or without
  preferences. Discover excludes lots already in Matches so the two never overlap.
- **Access code**: `/enter` compares the input to `ACCESS_CODE` (default `20240312`) and sets a
  signed cookie; a tiny middleware redirects everything else to `/enter` without it. `/admin*`
  has the same pattern with `ADMIN_CODE` and its own cookie. Two shared codes, no per-user
  passwords (#4 is real auth).
- **Poller** runs every `POLL_SECONDS` (default 5): closes auctions whose `closes_at` has passed
  (hammer/winner per lot, `sold` feed rows) and ingests new lots from the mock feed.
- **Categories**: fixed list in `lib/categories.js` (11): Contemporary Art, Modern British Art,
  Photography, Watches, Cars, Jewellery, Wine & Spirits, Design, Books & Manuscripts, Stuffed
  Animals, Miscellaneous IT Items. Admin add/drop of categories is #37.
- **Notifications** are an **in-app feed** (`notifications` table + `kind` + `read_at`):
  - `new_lot`: on new lot (admin or poller) → one row per matching user, `reason` = match reasons.
  - `outbid`: on accepted bid → one row for the previous high bidder (if different user). A user
    can be outbid on the same lot many times, so this is an **upsert**: `ON CONFLICT (user_id,
    lot_id, kind) DO UPDATE SET reason=…, created_at=now(), read_at=NULL` — the feed shows the
    latest loss as unread again; the bid history table keeps the full sequence.
  - `sold`: on auction close → one row per bidder on each sold lot ("Sold to X for Y").
  Unique on `(user_id, lot_id, kind)`. Shown on summary (unread badge) and history. Slack webhook
  delivery of unsent rows stays as an optional extra when `SLACK_WEBHOOK_URL` is set.
- **Auction status**: poller flips `upcoming→open→closed` from `starts_at`/`closes_at` every
  30 s **and** admin can force close/reopen (needed for a 5-minute demo; the schema doc says
  no manual flip — this is the one deliberate deviation, see §9). The poller only flips
  `open→closed` when `closes_at < now()`; **reopen** sets `status='open'` and, if `closes_at` has
  already passed, pushes it to `now() + 1 day` so the poller doesn't re-close it 30 s later.
- **Close** locks the auction's lots (`FOR UPDATE`, same lock as bidding) then sets
  `lots.hammer_price = MAX(amount)`, `winner_user_id = high bidder` for every lot with bids;
  lots without bids stay unsold. Reopen clears both.
- **Seeding**: on start, if `auction_houses` is empty, load `data/seed/*.json`. Seed rows use
  **natural keys**, not ids: houses by `name`, auctions by `(house name, house_ref)`, lots by
  `(house name, house_ref, lot_number)` — `house_ref` is only unique per house — users by `name`;
  the DB assigns ids and the loader resolves each level by lookup.
  Dates in seed are **absolute ISO timestamps** (the server runs 24/7, so "relative to now" would
  drift); the data phase sets them, and `/admin` shows an **edit closes_at** field per auction so
  the demo auctions can be re-timed minutes before the demo without touching SQL.

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

> **Decision (Mark):** demo data — users, **preferences**, houses, auctions, lots, bids,
> favorites, notifications — is generated in a **separate phase by a separate session**. What
> follows is the *shape and volume* the app should be built to handle, not the content. The app
> builder ships only the loader plus a tiny smoke dataset (§7 step 2) so `npm start` works; the
> data session replaces `data/seed/*.json` with the real content in the same shape. The app must
> also behave well for users the data phase gives *no* preferences to (see Discover).

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

Most users get preferences from the data phase; a few deliberately don't, to show Discover
carrying them. Many more than 6 users must work.

**Auction houses (4)**: Sotheby's, Christie's, Phillips, Bonhams — with real logo URLs and websites.

**Auctions (5+)** — statuses come from absolute `starts_at`/`closes_at`. **Demo requirement:**
several auctions are open at once during the demo, and **at least two of them open before
15 Sep and close on 15 Sep at two different times** (e.g. 10:30 and 11:15 local), so the audience
sees one auction close live — SOLD banners, `sold` feed rows — while bidding continues on the
other, and then a second close later. The exact times are edited on `/admin` right before the
demo once the slot is known.

| Auction | House | Status at demo | Purpose |
|---|---|---|---|
| Contemporary Evening Sale, London | Sotheby's | **open**, **closes 15 Sep, time A** | the main bidding stage; closes live during the demo |
| Important Watches & Motor Cars, Geneva | Phillips | **open**, **closes 15 Sep, time B (> A)** | Christian's beat; second live close |
| Design & Decorative Arts, London | Phillips | **open** (closes in a few days) | still open after the demo ends |
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
| 1 | 1.5 | Scaffold (#19): pg pool, access-code gate, layout, user picker, all stubs mounted. `npm start` works against Supabase |
| 2 | 1.5 | Seed loader (natural keys, absolute dates) + a *minimal* smoke dataset (2 users, 1 auction, 3 lots) so the app runs; real demo data is the separate data phase |
| 3 | 1.5 | Summary (feed + matches + Discover) + preferences + `matching.js` (+ tests) |
| 4 | 2 | Auctions, auction, lot detail; favorite + bid with validation |
| 5 | 1 | History page |
| 6 | 1.5 | Admin add-lot, edit `closes_at`, poller, `new_lot`/`outbid`/`sold` feed rows, optional Slack, close/reopen + SOLD + sound |
| 7 | 1 | README, `db/reset.sql`, EC2 deploy (`systemd` unit, `.env`, public URL), full click-through recording |
| | **10** | buffer 2 h |

Steps 3–6 are independent once 1–2 land; sequential is fine for one builder. Each step = one PR
(`feature:` / `bug:` commits), screenshots on each.

## 8. Schema review findings (Mark's DB session, 2026-09-15) — decisions (Mark, one by one)

| # | Finding | Decision |
|---|---|---|
| 1 | Seed/poller use string ids (`lot-101`) but schema ids are `BIGINT IDENTITY` | **Natural keys.** Seed files reference auctions by `(house, house_ref)` and lots by `(house_ref, lot_number)`; the DB assigns ids, the loader looks them up. No `OVERRIDING SYSTEM VALUE`. |
| 2 | `notifications UNIQUE(user_id, lot_id)` blocks an "outbid" notice after a "new lot" notice | **Notifications become an in-app feed** on the web frontend (new lot, outbid, sold), Slack optional. Schema: add `kind TEXT NOT NULL` (`new_lot` / `outbid` / `sold`), `read_at TIMESTAMPTZ`, unique becomes `(user_id, lot_id, kind)`. |
| 3 | Users without a `preferences` row match nothing | **The app never invents preferences** (the data phase populates them). Summary = "Matches your interests" + "Discover" (5 random open lots not yet bid/favorited, re-drawn per refresh), both always shown. Durable for any number of users and a changing catalogue. |
| 4 | Missing `CHECK (closes_at > starts_at)`, `hammer_price > 0`, winner-has-a-bid | Add the **two CHECKs**. No trigger for winner-has-a-bid (cross-table, needs a trigger; `close` derives winner from bids anyway). |
| 5 | Free-text categories → casing drift breaks matching | **Fixed list of 11** in `lib/categories.js` (see §4), dropdown + checkboxes, case-insensitive matching. Admin add/drop categories: **#37**. |
| 6 | Deleting a user with bids/wins fails (no `ON DELETE`) | **Intentional — governance.** Users are never deleted; `banned` instead. No change. |
| 7 | Comment says timed auctions "lots close individually" but close is auction-level | **V1 = silent auction**: all lots stay open until the auction closes, winners announced then. Fix the comment. Per-lot close after inactivity with Going… Going… Gone: **#38**. |

Schema changes from this table — #2 (`kind`, `read_at`, new unique), #4 (two CHECKs), #7
(comment) — are one small `schema.sql` PR plus the matching `ALTER`s on the live Supabase DB,
owned by the DB session since it holds the connection. Nothing else in the schema changes.

## 9. Decisions on the open points (Mark, 2026-09-15)

1. **Manual Close now / Reopen on `/admin`** — **keep both.** The poller does the real closes at
   `closes_at`; the buttons are the rehearsal safety net.
2. **Rehearsal reset** — **yes.** The seed files (`data/seed/*.json`, produced by the data
   session) are the single source of truth; `npm run db:reset` = TRUNCATE every table + reload
   from seed, in one transaction, runnable any number of times (before a demo, after a buggy
   rehearsal, between demos). Run it when nobody is bidding; anything added by hand that must
   survive goes into the seed files first.
3. **Images** — **Supabase Storage bucket `lots`.** The real dataset has 200–300 images, too
   many to hotlink from Wikimedia reliably. The data session uploads them; `lot_images.url` is
   the public bucket URL; `source_url` still links to Wikipedia.
4. **Bid amounts** — **whole units only**, any amount strictly above the current high bid.
   Minimum steps and cents later: #40 (with #26).
5. **Admin access** — **second code.** `/admin*` asks for `ADMIN_CODE` (default `20250714`,
   hint: *"The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE),
   ISO 8601 basic format…"*), separate cookie. The site-wide `ACCESS_CODE` (`20240312`) shows
   the hint *"Your favorite otter's birthday in ISO 8601 basic format…"*. Real roles: #12.
6. **Poller interval** — **5 s** (`POLL_SECONDS` env, default 5). Closes appear on the next page
   load; realtime push is #32.
7. **EC2 / secrets** — provided as org secrets: `AUCTION_DATABASE_URL`,
   `AUCTION_DATABASE_PASSWORD`, `RDT_EC2_SSH_KEY`. Devin deploys in step 7 (systemd unit, `.env`
   on the box). Hostname/port confirmed at build time.

No open decisions remain; the design is ready for Mark's sign-off, then step 1 of §7.
