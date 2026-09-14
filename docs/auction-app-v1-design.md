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
| Auction data | Seeded JSON fixtures (`data/seed/*.json`) loaded into SQLite on first start | Editable in any text editor |
| Triggering a "new item" | An `/admin` page with an "Add item to event" form | Deterministic demo of the notification flow |
| Ingestion / scheduler | A `setInterval` inside the app that re-reads `data/seed/items.json` every 30s and inserts any item IDs it hasn't seen | No cron, no queue; editing the JSON file *is* the auction site publishing a lot |
| Matching | Plain function: item matches if category or artist is in the user's list, price within range, or a keyword appears in the title | Readable in one screen |
| Slack | Single incoming webhook URL from `.env`; one channel, message names the user | No bot token, no OAuth, no user-ID mapping |
| Database | SQLite file `data/app.db`, created automatically; delete it to reset | Zero setup |
| Styling | One `public/styles.css`; no framework | Same approach as this site |

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
    seed/events.json
    seed/items.json     # edit this to "publish" new lots
  lib/
    matching.js         # matchesPreferences(item, prefs) -> boolean
    slack.js            # notifyNewItem(user, item, event)
    poller.js           # every 30s: read items.json, insert new, notify matches
  routes/
    index.js            # mounts every router below; GET / pick user
    preferences.js      # GET/POST /u/:userId/preferences
    summary.js          # GET /u/:userId/summary
    events.js           # GET /events, GET /events/:id, POST .../tickets
    items.js            # GET /items/:id, POST .../like, POST .../bid
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

```sql
CREATE TABLE users       (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id),
                          categories TEXT,   -- JSON array of strings
                          artists    TEXT,   -- JSON array of strings
                          keywords   TEXT,   -- JSON array of strings
                          min_price  INTEGER, max_price INTEGER);
CREATE TABLE events      (id TEXT PRIMARY KEY, title TEXT, location TEXT, starts_at TEXT);
CREATE TABLE items       (id TEXT PRIMARY KEY, event_id TEXT REFERENCES events(id),
                          title TEXT, artist TEXT, category TEXT,
                          estimate_low INTEGER, estimate_high INTEGER,
                          image_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE likes       (user_id INTEGER REFERENCES users(id), item_id TEXT REFERENCES items(id),
                          PRIMARY KEY (user_id, item_id));
CREATE TABLE tickets     (user_id INTEGER REFERENCES users(id), event_id TEXT REFERENCES events(id),
                          PRIMARY KEY (user_id, event_id));
CREATE TABLE bids        (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id),
                          item_id TEXT REFERENCES items(id),
                          amount INTEGER, placed_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE notifications (user_id INTEGER REFERENCES users(id), item_id TEXT REFERENCES items(id),
                          sent_at TEXT, PRIMARY KEY (user_id, item_id));
```

`db/db.js` runs `PRAGMA foreign_keys = ON` on every connection; SQLite ignores the
`REFERENCES` clauses otherwise.

Rule: a bid is accepted only if `amount > MAX(amount)` for that item (or `> estimate_low` if none).

## Seed data shape (`data/seed/items.json`)

```json
[
  { "id": "lot-101", "eventId": "ev-2026-10-london",
    "title": "Untitled (Blue)", "artist": "Yayoi Kusama", "category": "Contemporary Art",
    "estimateLow": 40000, "estimateHigh": 60000, "imageUrl": "/images/lot-101.jpg" }
]
```

Adding an object to this file (or using `/admin`) is how the team triggers a Slack notification.

## Pages (all server-rendered)

| URL | What the user sees |
|---|---|
| `/` | "Who are you?" dropdown → redirects to `/u/:id/summary` |
| `/u/:id/preferences` | Form: categories (checkboxes), artists (text, comma-separated), keywords, price range |
| `/u/:id/summary` | "Upcoming lots for you": matching items grouped by event, with Like / Bid / Book ticket buttons |
| `/events` , `/events/:id` | All upcoming events and their lots |
| `/items/:id` | Lot detail, current high bid, bid form |
| `/admin/items` | Form to add a lot to an event (the demo trigger) |

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
3. Events/items pages with Like / Bid / Book ticket.
4. `lib/poller.js` + `lib/slack.js` + `/admin/items`.
5. README + deploy (Pages can't run Node; use Render/Railway free tier or run locally for the demo).

Each step is one PR on its own branch. Steps 2–4 can be built in parallel once step 1 is merged.

## Deliberately left out of v1

Real login, per-user Slack DMs, scraping a real auction site, a separate mock service, a
frontend framework, Postgres, background job queues, tests beyond `lib/matching.js`.
