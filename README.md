# Real Dream Team

Two things live here:

1. **The auction app** (`auction-app/`) — the team's internal auction-interest
   demo. **Live at <https://rdt-auction.marklovestech.com>.** Everything about it
   is in [`auction-app/README.md`](auction-app/README.md): how to use it, how to
   change it, how to run it locally, how to reset the data, how it's deployed.
2. **The static website** (`src/`) — plain HTML/CSS, deployed to GitHub Pages on
   every push to `main` (`.github/workflows/pages.yml`).
   Local preview: `python3 -m http.server 8080 -d src`

## The auction app in one minute

- Go to <https://rdt-auction.marklovestech.com>, enter the site code (hint on
  the page: your favorite otter's birthday, `YYYYMMDD`), pick your name.
- Your **summary** shows notifications, lots that match your interests, and a
  **Discover** row of five random open lots (fresh on every refresh).
- Browse **auctions** and **lots**, ★ favorite lots, place **bids** (whole
  numbers, must beat the current high bid). Being outbid puts a notification on
  your summary; your **history** lists every bid and favorite with its status.
- When an auction's close time passes (or an admin clicks *Close now*), the
  highest bid on each lot wins: SOLD ribbon, hammer price, winner, a sound, and
  Won/Lost notifications for everyone who bid.
- **/admin** (second code) lets you add lots, change close times, close/reopen
  auctions and ban/unban users.

## Design history

- [Build design](docs/auction-app-build-design.md) — the design the app was built
  from, with every decision recorded (§8–§9).
- [Schema reference](docs/auction-app-schema.md) · [Original V1 design](docs/auction-app-v1-design.md)
- Deferred features are GitHub issues: per-lot "Going… Going… Gone" close (#38),
  bid increments / cents (#40), category admin (#37).
