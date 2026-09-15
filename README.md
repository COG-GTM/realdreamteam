# Real Dream Team

Static site. Source lives in `src/` (`index.html`, `assets/css`, `assets/images`). Deployed to GitHub Pages on every push to `main` via `.github/workflows/pages.yml`
(enable Pages with source "GitHub Actions" in repo Settings → Pages).

Local preview: `python3 -m http.server 8080 -d src`

## Auction app (`auction-app/`)

A small internal app where team members follow upcoming auctions, favorite lots, and place bids,
with notifications when new lots match their interests.

The database is **Supabase Postgres**. The schema lives in `auction-app/db/schema.sql` — 9 tables:

- `auction_houses` — the auction houses we track (name, location, logo)
- `users` — team members using the app (email, avatar, banned flag)
- `preferences` — each user's categories, artists, and keywords of interest
- `auctions` — upcoming, open, and closed auction events
- `lots` — the individual items up for auction
- `lot_images` — photos of lots, stored in Supabase Storage
- `favorites` — lots a user has favorited
- `bids` — bids placed on lots
- `notifications` — pending and sent match notifications

The app connects using the `AUCTION_DATABASE_URL` and `AUCTION_DATABASE_PASSWORD` environment
variables. Images live in Supabase Storage buckets (`logos`, `avatars`, `lots`).

Status: **V1 data model final; app code not started.**

More detail:
- [V1 design doc](docs/auction-app-v1-design.md)
- [Schema reference](docs/auction-app-schema.md)
- [Deferred bidding features (issues)](https://github.com/COG-GTM/realdreamteam/issues?q=label%3Adeferred-bidding)
