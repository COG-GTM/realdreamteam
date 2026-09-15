# Auction Interest App — v1 Design (Proposal)

Status: proposal for team review. Decisions marked **Decided** were confirmed in the design
session; everything else is a default chosen for simplicity and can be changed before build starts.

## Goals for v1

- A non-technical team member can run it with two commands and understand every file.
- One deployable thing. No build step, no separate services, no cloud database.
- Every feature from the original plan is present in its simplest form.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Stack | **Decided:** Node + Express, SQLite, server-rendered HTML (EJS templates) | Plain files, no compiler, `npm start` and it runs |
| Auth | **Decided:** no login — pick your name from a dropdown of seeded users | Removes passwords, sessions, email |
| Auction data | Seeded JSON fixtures (`data/seed/*.json`) loaded into SQLite on first start — **the seed files already exist in `auction-app/data/seed/`** | Editable in any text editor |
| Triggering a "new item" | An `/admin` page with an "Add item to event" form | Deterministic demo of the notification flow |
| Ingestion / scheduler | A `setInterval` inside the app that re-reads `data/seed/items.json` every 30s and inserts any item IDs it hasn't seen | No cron, no queue; editing the JSON file *is* the auction site publishing a lot |
| Matching | Plain function: item matches if category or artist is in the user's list, price within range, or a keyword appears in the title | Readable in one screen |
| Slack | Single incoming webhook URL from `.env`; one channel, message names the user | No bot token, no OAuth, no user-ID mapping |
| Database | SQLite file `data/app.db`, created automatically; delete it to reset | Zero setup |
| Styling | One `public/styles.css`; no framework | Same approach as this site |
| Demo hosting | **Decided:** run locally on the presenter's laptop (`npm start`). GitHub Pages only serves the static site in `src/` and cannot run Node | Zero deploy risk for the demo |
| Location in repo | **Decided:** `auction-app/` at the repo root, next to `src/` (the existing static site). The Pages workflow only uploads `src/`, so the app is never published as static files | Keeps the two things separate |

## Repo layout

```
auction-app/
  package.json          # express, ejs, better-sqlite3, dotenv
  server.js             # starts Express, runs seed, starts poller
  .env.example          # SLACK_WEBHOOK_URL=  APP_BASE_URL=http://localhost:3000
  db/
    schema.sql          # CREATE TABLE statements (below)
    db.js               # open SQLite (PRAGMA foreign_keys = ON), run schema, seed if empty
  data/
    seed/users.json
    seed/auction_houses.json
    seed/sales.json
    seed/items.json     # edit this to "publish" new lots; each lot has an images array
  lib/
    matching.js         # matchesPreferences(item, prefs) -> boolean
    slack.js            # notifyNewItem(user, item, sale)
    poller.js           # every 30s: read items.json, insert new, notify matches
  routes/
    index.js            # mounts every router below; GET / pick user
    preferences.js      # GET/POST /u/:userId/preferences
    summary.js          # GET /u/:userId/summary
    sales.js           # GET /sales, GET /sales/:id, POST .../tickets
    items.js            # GET /items/:id, POST .../favorite, POST .../bid
    admin.js            # GET/POST /admin/items
  views/                # one .ejs per route above + layout.ejs
  public/styles.css
```

Directory ownership for parallel work: one workstream per file in `lib/` and `routes/`
(+ its view). `db/schema.sql` and `data/seed/` are frozen after milestone 1.

Milestone 1 creates every file in `lib/` and `routes/` as a stub and mounts all routers from
`routes/index.js`, so `server.js` and `routes/index.js` are never touched again. Later PRs
only fill in their own file and view.

## Schema (`db/schema.sql`)

Schema lives in [`auction-app-schema.md`](auction-app-schema.md).

`db/db.js` runs `PRAGMA foreign_keys = ON` on every connection; SQLite ignores the
`REFERENCES` clauses otherwise.

## Seed data (`auction-app/data/seed/`)

The mock data is already written — milestone 1 just loads it:

| File | Contents |
|---|---|
| `users.json` | 6 team members, each with pre-filled `preferences` so the summary page is non-empty on first run |
| `auction_houses.json` | 4 auction houses with IDs, names, and website roots |
| `sales.json` | 3 upcoming sales: London (art), Geneva (watches & cars), New York (wine, books, design) |
| `items.json` | 18 lots across those sales; each has an `images` array with Wikimedia Commons credits |

Item shape:

```json
{ "id": "lot-101", "saleId": "ev-2026-10-london", "lotNumber": 1,
  "title": "Untitled (Blue)", "artist": "Yayoi Kusama", "category": "Contemporary Art",
  "description": "Acrylic on canvas, 2019, 130 × 162 cm", "currency": "GBP",
  "estimateLow": 40000, "estimateHigh": 60000, "startingBid": 40000,
  "sourceUrl": null,
  "images": [{ "url": "https://upload.wikimedia.org/...",
               "credit": "CC BY-SA 4.0, Wikimedia Commons" }] }
```

Categories used (drive the preferences checkboxes): Contemporary Art, Photography, Watches,
Cars, Jewellery, Wine & Spirits, Design, Books & Manuscripts.

Adding an object to `items.json` (or using `/admin`) is how the team triggers a Slack notification.

## Demo golden path (must work)

1. Open `http://localhost:3000`, pick **Mark Porter**.
2. Summary shows Kusama / Banksy lots from the London sale already matched.
3. Open `/admin/items`, add a lot: title "Pumpkin (Blue)", artist "Yayoi Kusama", category
   "Contemporary Art", 50,000–70,000, sale London.
4. Slack channel (or the console, if no webhook) shows "New lot for Mark Porter …".
5. Back on the summary, Favorite it, then Bid 55,000. Book a ticket for the London sale.

Everything else is nice-to-have for the demo.

## Pages (all server-rendered)

| URL | What the user sees |
|---|---|
| `/` | "Who are you?" dropdown → redirects to `/u/:id/summary` |
| `/u/:id/preferences` | Form: categories (checkboxes), artists (text, comma-separated), keywords, price range |
| `/u/:id/summary` | "Upcoming lots for you": matching items grouped by sale, with Favorite / Bid / Book ticket buttons |
| `/sales` , `/sales/:id` | All upcoming sales and their lots |
| `/items/:id` | Lot detail, current high bid, bid form |
| `/admin/items` | Form to add a lot to a sale (the demo trigger) |

## Poller and notifications

Every 30s `lib/poller.js`:

1. Reads `items.json`, inserts rows whose `id` is not yet in `items`.
2. For each new item and each user whose preferences match, inserts a `notifications` row
   with `sent_at = NULL` in the same transaction.
3. Selects all `notifications WHERE sent_at IS NULL`, posts each to Slack, and sets `sent_at`
   on success. A failed post stays `NULL` and is retried on the next tick.

The `/admin/items` form does steps 2–3 immediately after inserting.

## Slack message

```
New lot for Mark Porter: "Untitled (Blue)" by Yayoi Kusama
Contemporary Art · est. $40,000–$60,000 · London, 12 Oct 2026
https://<APP_BASE_URL>/items/lot-101
```

Sent via `POST SLACK_WEBHOOK_URL` with `{ "text": "..." }`. Links are built from
`APP_BASE_URL` (default `http://localhost:3000`). If `SLACK_WEBHOOK_URL` is unset, log to
console instead so the app runs without Slack.

## Running it

```
cp .env.example .env      # optionally paste a Slack webhook URL
npm install
npm start                 # http://localhost:3000
```

## Build order

1. `package.json`, `server.js`, `db/`, seed files, `/` page, stub files for every router and
   `lib/` module, all mounted in `routes/index.js` — one PR, lands first.
2. Preferences page + `lib/matching.js` + summary page.
3. Sales/items pages with Favorite / Bid / Book ticket.
4. `lib/poller.js` + `lib/slack.js` + `/admin/items`.
5. README (run-locally instructions). No deploy step for the demo; a hosted target is tracked in #10.

Each step is one PR on its own branch. Steps 2–4 can be built in parallel once step 1 is merged.

## Deliberately left out of v1

Real login, per-user Slack DMs, scraping a real auction site, a separate mock service, a
frontend framework, Postgres, background job queues, tests beyond `lib/matching.js`.
