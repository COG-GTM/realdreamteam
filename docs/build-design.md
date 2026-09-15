# Auction Interest App — Build Design for the Demo

Status: **all open points decided (§9), awaiting Mark's final sign-off**. Supersedes the "Pages",
"Seed data" and "Build order" sections of [`v1-design.md`](v1-design.md);
the stack and decisions there still stand. Data model is frozen in
[`schema.md`](schema.md) / [`db/schema.sql`](../db/schema.sql) (#34).

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
   (unread badge) on next page load.
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
| 0 | `GET/POST /enter` | Single field: access code, with the hint *"Your favorite otter's birthday in ISO 8601 basic format…"*. Correct (`ACCESS_CODE` env, default `20240312`) sets a session cookie (gone when the browser closes); every other route redirects here without it. A **Sign out** button in the top bar (`POST /signout`) clears both the site and admin cookies. `/admin*` additionally asks for `ADMIN_CODE` (default `20250714`, hint *"The day Cognition signed the definitive agreement to acquire Windsurf (agentic IDE)…"*) | enter → `/` |
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
  Photography, Watches, Cars, Jewellery, Wine & Spirits, Design, Books & Manuscripts, Toys and
  Clothes, Miscellaneous IT Items. Admin add/drop of categories is #37.
- **Notifications** are an **in-app feed** (`notifications` table + `kind` + `read_at`):
  - `new_lot`: on new lot (admin or poller) → one row per matching user, `reason` = match reasons.
  - `outbid`: on accepted bid → one row for the previous high bidder (if different user). A user
    can be outbid on the same lot many times, so this is an **upsert**: `ON CONFLICT (user_id,
    lot_id, kind) DO UPDATE SET reason=…, created_at=now(), read_at=NULL` — the feed shows the
    latest loss as unread again; the bid history table keeps the full sequence.
  - `sold`: on auction close → one row per bidder on each sold lot ("Sold to X for Y").
  Unique on `(user_id, lot_id, kind)`. Shown on summary (unread badge) and history.
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
  package.json  server.js  .env.example  README.md
  db/schema.sql (frozen)  db/db.js (pool, query, seedIfEmpty)  db/reset.sql (TRUNCATE all, for re-demo)
  data/seed/{auction_houses,users,preferences,auctions,lots,bids,favorites,notifications}.json
  lib/matching.js (+ .test.js)  lib/poller.js
  routes/index.js  routes/{summary,preferences,auctions,lots,history,admin}.js
  views/layout.ejs  views/{index,summary,preferences,auctions,auction,lot,history,admin}.ejs
  views/partials/lot-card.ejs  views/partials/flash.ejs
  public/styles.css  public/sold.mp3
```

Reused from the closed #24 branch (already written, only needs renames + async `pg`):
`views/*`, `styles.css`, `matching.js` + tests, `poller.js`, close/SOLD flow,
`sold.mp3`, architecture diagrams.

## 6. Demo data — what was built (data session, 2026-09-15)

> Built table by table in FK order by the data session
> (https://app.devin.ai/sessions/7fa64fef151f440eb9ab5d7ca1a1bf1a), each table dictated or
> approved by Mark before moving on. Files live in `data/seed/` on branch
> `devin/1789454012-seed-data`. **Nothing has been loaded into the live DB** — that happens via
> the loader (§4 Seeding / §9.2 `db:reset`) when Mark says so. The old v2 seed
> (`items.json`, `sales.json`, `IMAGE_CREDITS.md`) was deleted.

### 6.1 Conventions

- One JSON array per table; rows carry **natural keys**, never DB ids: houses by `name`,
  users by `name`, auctions by `(house, house_ref)`, lots by `(house, house_ref, lot_number)`.
- All timestamps are **absolute UTC** (`...Z`). The app displays them in **US Central**
  (`America/Chicago`) — issue #45.
- `lot_images` rows are embedded in each lot as `images[]` (`position`, `url`, `credit`);
  `lots.winner_user_id` is expressed as `winner` (user name). The loader maps both.
- Every cross-reference was validated: all 8 auctions resolve to a house, all 265 lots to an
  auction, every bid/favorite/notification/winner to an existing user and lot.

### 6.2 Tables

| File | Rows | Content / decisions |
|---|---:|---|
| `auction_houses.json` | 4 | Sotheby's (New York), Christie's, Phillips, Bonhams (London). `website` + `logo_url`: Sotheby's/Christie's/Bonhams hotlink the logo from their own sites; Phillips has none online, so Mark's image is committed as `public/logos/phillips.png` → `/logos/phillips.png`. |
| `users.json` | 28 | The Cognition team as supplied by Mark (first name + email). Two "Mark"s disambiguated as **MarkK** (mark.kosoy@) and **MarkP** (mark@). `banned=false` for all. `avatar_url` = Gravatar by md5(email) with identicon fallback (`?d=identicon&s=200`); real local avatars are issue #42. |
| `preferences.json` | 26 | **No price range** — Mark dropped budget filtering for good (no issue). 2–4 categories per user from the fixed list, 2–3 researched artists/makers matching those categories (e.g. Rolex/Lange for Watches, Château Margaux/DRC for Wine, Steiff/Merrythought for Toys and Clothes, Commodore/Cray for IT), 0–4 deliberately fun keywords (penguins, blenders, volcanoes, tacos…). **Matthew and Nouf have no row** to exercise Discover-only. MarkP: Contemporary Art, Photography, Cars, Watches · Banksy, Diane Arbus, Marc Chagall, Claude Monet · toaster, llamas, robots. Reilly: Contemporary/Modern British Art, Watches, Cars · Warhol, Rolex, Aston Martin · tennis, racquets, penguins, trophies. |
| `auctions.json` | 8 | The 6 from the original plan plus 2 Mark asked for so that **four auctions close live on 15 Sep at staggered Central times** (see below). Each has `house_ref` (natural key), `format`, `status`, `source_url`. |
| `lots.json` | 265 | Mark set minimums per category; agreed split: Contemporary Art 45, Modern British Art 40, Photography 28, Watches 8, Cars 18, Jewellery 6, Wine & Spirits 20, Design 17, Books & Manuscripts 38, Toys and Clothes 21, Miscellaneous IT Items 24. Every lot: real image (Wikimedia Commons or Wikipedia fair-use, credited), Wikipedia `source_url`, catalogue-style description, estimates + `starting_bid` (≈50–75 % of low estimate) in the auction's currency (GBP/CHF/USD/EUR). Per auction: 25 / 24 / 30 / 40 / 39 / 48 / 40 / 18. ~40 subjects have no dedicated Wikipedia page, so their image/link is the closest page (artist, model line); ~25 % of images are fair-use — fine internally, not for public deployment. |
| `bids.json` | 350 | Closed auctions: 0–5 bids per lot (45 of 58 lots sold, 13 unsold). Open auctions: ~40 % of lots have 1–4 bids so far. First bid = `starting_bid`, each next bid +4–12 % (rounded), `placed_at` strictly increasing and inside the auction window (open ones up to ~now). All 28 users bid. **MarkP: 23 bids — leading on 9 open lots, outbid on 6.** No bids on the upcoming auction. |
| `lots.json` (closed) | 45 | `hammer_price` = highest bid, `winner` = that bidder, derived from `bids.json`; unsold lots keep both null. Sold lots are history only — a lot belongs to one auction and is never re-listed. |
| `favorites.json` | 66 | 1–4 per user (MarkP 4), mostly lots matching the user's prefs plus one off-interest each, on open/upcoming lots. |
| `notifications.json` | 519 | Derived, not invented: 150 `new_lot` (open/upcoming lots matching prefs; `reason` lists the match, e.g. `category: Watches · artist: Rolex`), 221 `outbid` (every bidder beaten by a later bid, `reason` = who/how much), 148 `sold` (every bidder on a sold closed lot). 223 unread (`read_at` null). MarkP: 14 / 12 / 8, 13 unread. |

### 6.3 Auctions

| # | House | Auction | Location | Format | Status | Starts (UTC) | Closes (UTC → Central) |
|---|---|---|---|---|---|---|---|
| 1 | Christie's | Post-War & Contemporary Art Online *(added)* | Online | timed | open | 05 Sep 14:00 | 15 Sep 15:00 → **10:00** |
| 2 | Sotheby's | Contemporary Evening Sale | London | live | open | 08 Sep 18:00 | 15 Sep 15:30 → **10:30** |
| 3 | Phillips | Important Watches & Motor Cars | Geneva | live | open | 09 Sep 13:00 | 15 Sep 16:15 → **11:15** |
| 4 | Bonhams | The Collector's Garage: Fine Motor Cars, Watches & Automobilia *(added)* | Online | timed | open | 07 Sep 12:00 | 15 Sep 17:00 → **12:00** |
| 5 | Phillips | Design & Decorative Arts | London | live | open | 12 Sep 10:00 | 19 Sep 14:00 |
| 6 | Christie's | Fine Wine, Books & Design | New York | live | upcoming | 29 Sep 14:00 | 01 Oct 22:00 |
| 7 | Bonhams | Modern British Art | London | live | closed | 03 Sep 13:00 | 08 Sep 16:00 |
| 8 | Christie's | Photographs | Paris | live | closed | 10 Aug 13:00 | 14 Aug 16:00 |

Four live closes over two hours on demo day, #5 stays open afterwards, #6 shows "upcoming",
#7–8 supply SOLD results and history. `/admin` can still re-time `closes_at` before the demo.

### 6.4 Demo trigger lot

Not seeded; typed live on `/admin`: a Chagall or Monet, Contemporary Art, in an open London
sale — matches MarkP (artist + category) and Reilly/Hitomi (category), so several alerts fire.

### 6.5 Open items

- Images are **hotlinked** from Wikimedia/Wikipedia today (`images[].url`); §9.3's upload to the
  Supabase `lots` bucket has not been done (needs a service-role key) — decide before a public deployment.
- Loader must accept the extra files (`preferences`, `bids`, `favorites`, `notifications`), the
  embedded `images[]`, and `winner` by name.
- #42 real avatars, #45 Central-time display.

## 7. Build plan (< 12 h, one builder + Devin)

| Step | Hours | Deliverable |
|---|---|---|
| 1 | 1.5 | Scaffold (#19): pg pool, access-code gate, layout, user picker, all stubs mounted. `npm start` works against Supabase |
| 2 | 1.5 | Seed loader (natural keys, absolute dates) + a *minimal* smoke dataset (2 users, 1 auction, 3 lots) so the app runs; real demo data is the separate data phase |
| 3 | 1.5 | Summary (feed + matches + Discover) + preferences + `matching.js` (+ tests) |
| 4 | 2 | Auctions, auction, lot detail; favorite + bid with validation |
| 5 | 1 | History page |
| 6 | 1.5 | Admin add-lot, edit `closes_at`, poller, `new_lot`/`outbid`/`sold` feed rows, close/reopen + SOLD + sound |
| 7 | 1 | README, `db/reset.sql`, EC2 deploy (`systemd` unit, `.env`, public URL), full click-through recording |
| | **10** | buffer 2 h |

Steps 3–6 are independent once 1–2 land; sequential is fine for one builder. Each step = one PR
(`feature:` / `bug:` commits), screenshots on each.

## 8. Build process — sessions and infrastructure 

The build is split across Devin sessions, one per concern. This section is the index of those
sessions and of the infrastructure they share, collected from the "Links and References" session.

### 8.1 Sessions

| Session | Link |
|---|---|
| Design | https://app.devin.ai/sessions/561423377905490f860d4dce40ebaffc |
| Permissions & access | https://app.devin.ai/sessions/6f260d9890044a15b05ba97aa63a780c |
| Backend database work | https://app.devin.ai/sessions/3fad6d1676eb4e2696b7530c1790c2cd |
| Data Model (`devin-58958727868644a5b50e5392ef87f177`) | https://app.devin.ai/sessions/58958727868644a5b50e5392ef87f177 |
| RDT Synthetic Data | https://app.devin.ai/sessions/7fa64fef151f440eb9ab5d7ca1a1bf1a |
| RDT-Quality | https://app.devin.ai/sessions/89efaff3ae2a447a81a1d3937c824900 |
| RDT-Security | https://app.devin.ai/sessions/26ffca78071c4df0be84df380f9be03b |
| Links and References (this index) | https://app.devin.ai/sessions/dffb7ddf86af4c018beba279c2f13c77 |

### 8.2 Infrastructure

> **Connection details are not in this repo.** The repository is public, so hosts, IPs, users
> and ports for the database and the EC2 box live in the private Devin knowledge note
> **"RDT infrastructure access"** (scope: repo `COG-GTM/realdreamteam`), which every Devin session
> on this repo loads automatically. Credentials are Devin org secrets:
> `AUCTION_DATABASE_URL`, `AUCTION_DATABASE_PASSWORD`, `RDT_EC2_SSH_KEY`.

**GitHub repo** — https://github.com/COG-GTM/realdreamteam

- Schema: `db/schema.sql` (9 tables, `public`, all commented); incremental changes
  under `db/migrations/`.

**Supabase (Real Dream Team auction app)**

- Supabase Postgres, reached through the Supavisor session pooler. Project ref, dashboard link,
  pooler host and user: **see the knowledge note**.
- Connect from a shell with the secrets only:
  `PGPASSWORD="$AUCTION_DATABASE_PASSWORD" psql "$AUCTION_DATABASE_URL"`
- Images live in Supabase Storage buckets `logos`, `avatars`, and `lots`.

**EC2 instance — `rdt-auction`**

- Single ARM64 Ubuntu host running Node 20 behind Caddy (80/443, Let's Encrypt) reverse-proxying
  to `localhost:3000`. Public IP, DNS name, SSH user, security group and current on-box state:
  **see the knowledge note**.
- SSH is key-based only; the private key is the Devin secret `RDT_EC2_SSH_KEY`.
