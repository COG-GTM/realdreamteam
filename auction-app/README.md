# Real Dream Team auction app

An internal "silent auction" site for the team: everyone follows auctions,
favorites lots, bids against each other and gets notified when they are outbid
or when a lot that matches their interests appears. Lots stay open until their
auction closes; then the highest bid wins.

**Live:** <https://rdt-auction.marklovestech.com> · site code hint on the page
(your favorite otter's birthday, `YYYYMMDD`) · admin at `/admin` (second code,
hint on the page).

Plain Node.js 20 + Express + EJS templates + hand-written SQL against Supabase
Postgres. No build step, no framework magic — every page is one route file and
one template.

## Using the app

| Page | What you do there |
|---|---|
| `/enter` | Enter the site code; you are remembered until you close the browser (or click **Sign out** in the top bar, which forgets both the site and admin codes). |
| `/` | Pick your name. Everything after this is under `/u/<your id>/…`. |
| **Summary** `/u/:id/summary` | Your home page. **Notifications** (new matching lots, outbid, sold — unread ones are highlighted; *Mark all read* clears the badge). **Matches your interests** — open lots matching your preferences, each with a chip saying *why* it matched. **Discover** — five random open lots you haven't bid on or favorited, different on every refresh (*Shuffle*). Everyone gets Discover, even with no preferences. |
| **Preferences** `/u/:id/preferences` | Tick categories (fixed list, see `lib/categories.js`), type artists and keywords (comma-separated). Optional — it only sharpens Matches. |
| **Auctions** `/u/:id/auctions` | All auctions grouped Open / Upcoming / Closed, with lot and bid counts. Click through to the auction's lots. |
| **Lot** `/u/:id/lots/:lotId` | Images, estimate, link to the source page, ★ favorite toggle, the bid form and the full bid history (newest first). Bids are whole numbers and must beat the current high bid (or meet the starting bid on the first bid). You can bid again after being outbid. Closed lots show SOLD, hammer price and winner (and play `sold.mp3`). |
| **History** `/u/:id/history` | Every bid you've placed with its state — Winning / Outbid / Won / Lost — and your favorites. |
| **Admin** `/admin` | Table of auctions with editable close time (UTC), *Close now* / *Reopen*; add a lot to any auction (matching users get a notification); ban / unban users (banned users can't bid, nothing is deleted) |

How closing works: a poller runs every `POLL_SECONDS` (5 s). It flips
`upcoming` auctions to `open` when `starts_at` passes and closes `open`
auctions when `closes_at` passes. Closing an auction (poller or *Close now*)
takes the highest bid on each lot (earliest bid wins a tie), sets hammer price
and winner, and sends a `sold` notification to every bidder. *Reopen* clears
the results but keeps all bids, and pushes `closes_at` forward if it is in the
past.

## Changing the app

```
server.js            starts Express, mounts routes, starts the poller
routes/*.js          one file per page: summary, preferences, auctions, lots, history, admin
views/*.ejs          the matching HTML template for each page; partials/lot-card.ejs is the lot tile
lib/matching.js      "does this lot match these preferences?" (category | artist | keyword)
lib/bids.js          bid validation + placing a bid (transaction, row lock, outbid notification)
lib/close.js         close / reopen an auction, pick winners, sold notifications
lib/new-lot.js       admin add-lot validation + new_lot notifications
lib/poller.js        the 5 s status poller
lib/categories.js    the fixed category list (edit here to add one)
lib/notifications.js feed queries, unread count, mark-all-read
public/styles.css    all styling; public/sold.mp3 the sale sound
db/schema.sql        the 9 tables; db/db.js the pool, transactions and seed loader
data/seed/*.json     the demo data (see "Seed contract")
```

Typical edits: change wording → the `.ejs` file for that page; change a rule
(minimum bid, who gets notified) → the `lib/` file named for it; change the
look → `public/styles.css`. Run `npm test` (`node --test`) after touching
`lib/`.

## Run locally

```sh
cp .env.example .env
npm install
npm run db:reset
npm start
```

Open <http://localhost:3000>. The default site code is `20240312`; the
default admin code is `20250714`.

For the local PostgreSQL 14 database used during development:

```sh
createdb -p 5433 rdt_local
psql -p 5433 -d rdt_local -f db/schema.sql
```

Set `AUCTION_DATABASE_PASSWORD` in `.env` when the local PostgreSQL role
requires a password. Do not point local verification at the shared Supabase
database.

Before running `db:reset` against Supabase, apply every migration in
`db/migrations/`; migration `002-bigint-money.sql` is required for the
trillion-dollar lot.

### Safety

Some environments pre-inject the shared Supabase connection variables. The
application loads `.env` with override enabled, so the values in `.env` win.
`db:reset` refuses remote database hosts unless you explicitly confirm the
operation. Before a deliberate remote reset, use:

```sh
ALLOW_REMOTE_RESET=1 npm run db:reset
```

## Reset

`npm run db:reset` truncates the nine application tables, resets identity
sequences, and loads the seed contract in one transaction. It is safe to run
repeatedly.

## Environment

- `AUCTION_DATABASE_URL`: PostgreSQL connection string.
- `AUCTION_DATABASE_PASSWORD`: password passed separately to `pg.Pool`.
- `ACCESS_CODE`: site-wide access code, default `20240312`.
- `ADMIN_CODE`: admin access code, default `20250714`.
- `POLL_SECONDS`: interval used by the lightweight poller, default `5`.
- `SLACK_WEBHOOK_URL`: optional Slack incoming-webhook URL.
- `PORT`: HTTP port, default `3000`.
- `COOKIE_SECRET`: secret used to sign access cookies, default `change-me`.

## Seed contract

The data phase supplies these files in `data/seed/`:

- `users.json`: an array of `{name, email, avatar_url, banned, preferences?}`.
  A preference object has `categories`, `artists`, and `keywords` arrays.
  A `preferences` row is created only when that property is present.
- `preferences.json`: `{user, categories, artists, keywords}` objects for
  users whose preferences are stored separately from `users.json`.
- `auction_houses.json`: `{name, location, website, logo_url}` objects.
- `auctions.json`: `{house, house_ref, title, location, format, starts_at,
  closes_at, source_url}` objects. `house` is the exact house name and dates
  are absolute ISO 8601 timestamps. The loader computes `status` from them.
- `lots.json`: `{house, house_ref, lot_number, title, artist, category,
  description, currency, estimate_low, estimate_high, starting_bid,
  hammer_price, winner, source_url, images}` objects. `hammer_price` and
  `winner` are optional closed-lot result fields. Each image is
  `{url, credit}` and is stored in its array order.

The loader uses natural keys rather than fixture IDs: users by `name`, houses
by `name`, auctions by `(house, house_ref)`, and lots by
`(house, house_ref, lot_number)`. PostgreSQL assigns all numeric IDs. Lot
categories must be one of the values exported by `lib/categories.js`.

Optional activity files may also be supplied:

- `bids.json`: `{house, house_ref, lot_number, user, amount, placed_at}`.
- `favorites.json`: `{user, house, house_ref, lot_number}`.
- `notifications.json`: `{user, house, house_ref, lot_number, kind, reason,
  created_at, read_at, sent_at}`. Duplicate `(user, lot, kind)` rows are
  ignored.

Unknown natural keys and invalid categories fail the transaction with a clear
error. This seed shape is the contract for the data-phase session.

## Deploy (EC2)

The production demo runs on the `rdt-auction` EC2 host (address, SSH user and
access details are in the private Devin knowledge note "RDT infrastructure
access"; the SSH key is the `RDT_EC2_SSH_KEY` secret) from
`/opt/rdt/realdreamteam/auction-app`, using the shared Supabase PostgreSQL
database. The `rdt-auction.service` systemd unit runs the app with its settings
in the mode-600 `.env` file.

To update the checkout on the server:

```sh
cd /opt/rdt/realdreamteam
git pull
cd auction-app
npm ci --omit=dev
sudo systemctl restart rdt-auction
```

Check the service and recent logs with:

```sh
sudo systemctl status rdt-auction
journalctl -u rdt-auction -n 50 --no-pager
```

Caddy (`/etc/caddy/Caddyfile`) terminates TLS for
<https://rdt-auction.marklovestech.com> (Let's Encrypt, auto-renew) and
proxies to `:3000`; DNS A record at IONOS. Do not run `db:reset` on the
production host.
