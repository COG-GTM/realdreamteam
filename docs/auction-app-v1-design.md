# Auction Interest App — v1 Design (Proposal)

Status: proposal for team review. Decisions marked **Decided** were confirmed in the design
session; everything else is a default chosen for simplicity and can be changed before build starts.

## Goals for v1

- A non-technical team member can run it with two commands and understand every file.
- One deployable thing. No build step or separate application services.
- Every feature from the original plan is present in its simplest form.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Stack | **Decided:** Node + Express, Supabase Postgres, server-rendered HTML (EJS templates) | Plain files, no compiler, `npm start` and it runs |
| Auth | **Decided:** no login — pick your name from a dropdown of seeded users | Removes passwords, sessions, email |
| Auction data | Seeded JSON fixtures (`data/seed/*.json`) loaded into Supabase Postgres on first start — **the seed files already exist in `auction-app/data/seed/`** | Editable in any text editor |
| Triggering a "new item" | An `/admin` page with an "Add item to event" form | Deterministic demo of the notification flow |
| Ingestion / scheduler | A `setInterval` inside the app that re-reads `data/seed/items.json` every 30s and inserts any item IDs it hasn't seen | No cron, no queue; editing the JSON file *is* the auction site publishing a lot |
| Matching | Plain function: item matches if category or artist is in the user's list, price within range, or a keyword appears in the title | Readable in one screen |
| Slack | Single incoming webhook URL from `.env`; one channel, message names the user | No bot token, no OAuth, no user-ID mapping |
| Database | Supabase Postgres, configured with `AUCTION_DATABASE_URL` | Durable hosted storage |
| Styling | One `public/styles.css`; no framework | Same approach as this site |
| Demo hosting | **Decided:** run locally on the presenter's laptop (`npm start`). GitHub Pages only serves the static site in `src/` and cannot run Node | Zero deploy risk for the demo |
| Location in repo | **Decided:** `auction-app/` at the repo root, next to `src/` (the existing static site). The Pages workflow only uploads `src/`, so the app is never published as static files | Keeps the two things separate |

## Repo layout

```
auction-app/
  package.json          # express, ejs, pg, dotenv
  server.js             # starts Express, runs seed, starts poller
  .env.example          # SLACK_WEBHOOK_URL=  APP_BASE_URL=http://localhost:3000
  db/
    schema.sql          # CREATE TABLE statements (below)
    db.js               # connect to Supabase Postgres, run schema, seed if empty
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
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  categories JSONB,
  artists JSONB,
  keywords JSONB,
  min_price INTEGER,
  max_price INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT,
  location TEXT,
  starts_at TEXT
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id),
  title TEXT,
  artist TEXT,
  category TEXT,
  estimate_low INTEGER,
  estimate_high INTEGER,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER REFERENCES users(id),
  item_id TEXT REFERENCES items(id),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS tickets (
  user_id INTEGER REFERENCES users(id),
  event_id TEXT REFERENCES events(id),
  PRIMARY KEY (user_id, event_id)
);
CREATE TABLE IF NOT EXISTS bids (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  item_id TEXT REFERENCES items(id),
  amount INTEGER,
  placed_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  user_id INTEGER REFERENCES users(id),
  item_id TEXT REFERENCES items(id),
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, item_id)
);
```

Rule: a bid is accepted only if `amount > MAX(amount)` for that item (or `> estimate_low` if none).

## Seed data (`auction-app/data/seed/`)

The mock data is already written — milestone 1 just loads it:

| File | Contents |
|---|---|
| `users.json` | 6 team members, each with pre-filled `preferences` so the summary page is non-empty on first run |
| `events.json` | 3 upcoming events: London (art), Geneva (watches & cars), New York (wine, books, design) |
| `items.json` | 18 lots across those events; `imageUrl` points at placehold.co so no image files are needed |

Item shape:

```json
{ "id": "lot-101", "eventId": "ev-2026-10-london",
  "title": "Untitled (Blue)", "artist": "Yayoi Kusama", "category": "Contemporary Art",
  "estimateLow": 40000, "estimateHigh": 60000, "imageUrl": "https://placehold.co/600x400?text=Lot+101" }
```

Categories used (drive the preferences checkboxes): Contemporary Art, Photography, Watches,
Cars, Jewellery, Wine & Spirits, Design, Books & Manuscripts.

Adding an object to `items.json` (or using `/admin`) is how the team triggers a Slack notification.

## Demo golden path (must work)

1. Open `http://localhost:3000`, pick **Mark Porter**.
2. Summary shows Kusama / Banksy lots from the London sale already matched.
3. Open `/admin/items`, add a lot: title "Pumpkin (Blue)", artist "Yayoi Kusama", category
   "Contemporary Art", 50,000–70,000, event London.
4. Slack channel (or the console, if no webhook) shows "New lot for Mark Porter …".
5. Back on the summary, Like it, then Bid 55,000. Book a ticket for the London sale.

Everything else is nice-to-have for the demo.

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
cp .env.example .env      # set AUCTION_DATABASE_URL and optionally paste a Slack webhook URL
npm install
npm start                 # http://localhost:3000
```

Reset the seeded data with `npm run db:reset -- --yes`.

## Build order

1. `package.json`, `server.js`, `db/`, seed files, `/` page, stub files for every router and
   `lib/` module, all mounted in `routes/index.js` — one PR, lands first.
2. Preferences page + `lib/matching.js` + summary page.
3. Events/items pages with Like / Bid / Book ticket.
4. `lib/poller.js` + `lib/slack.js` + `/admin/items`.
5. README (run-locally instructions). No deploy step for the demo; a hosted target is tracked in #10.

Each step is one PR on its own branch. Steps 2–4 can be built in parallel once step 1 is merged.

## Deliberately left out of v1

Real login, per-user Slack DMs, scraping a real auction site, a separate mock service, a
frontend framework, Postgres, background job queues, tests beyond `lib/matching.js`.
