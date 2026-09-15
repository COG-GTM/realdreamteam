# Auction Interest Demo

This is a small server-rendered auction demo. It uses Express, EJS, and a
Postgres database. There is no client-side build step.

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

The production demo runs on `3.76.162.103` from
`/opt/rdt/realdreamteam/auction-app`, using the shared Supabase PostgreSQL
database. The `rdt-auction.service` systemd unit runs the app as the `ubuntu`
user with its settings in the mode-600 `.env` file.

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

HTTP port 80 is redirected to the app's port 3000 by the persistent
`rdt-auction-port80.service` systemd unit. Do not run `db:reset` on the
production host.
